#!/usr/bin/env python3
"""Deterministic Banco de Chile native-PDF statement extraction.

The worker accepts its PDF and password only through JSON stdin. It never follows
links, runs document instructions, writes decrypted files or logs document text.
"""
import base64
from datetime import datetime
import hashlib
import io
import json
import logging
import re
import sys
import unicodedata

MAX_PDF_BYTES = 5 * 1024 * 1024
MAX_PAGES = 80
MAX_TEXT_CHARS = 1500000
MAX_ITEMS = 2500
DATE_LONG = r'\d{2}/\d{2}/\d{4}'
DATE_SHORT = r'\d{2}/\d{2}/\d{2}(?!\d)'
CLP_TOKEN = r'-?\d[\d.]*'
USD_TOKEN = r'-?\d[\d.]*,\d{2}'
NATIONAL_ROW = re.compile(r'(' + DATE_SHORT + r')\s+(\d{4,32})\s+(.+?)\s+\$\s*(' + CLP_TOKEN + r')\s+\$\s*(' + CLP_TOKEN + r')\s+(\d{1,3})/(\d{1,3})\s+\$\s*(' + CLP_TOKEN + r')\s*$')
INTERNATIONAL_ROW = re.compile(r'^\s*(?:(\d{4})\s+)?(?:(\d{8,32})\s+)?(' + DATE_SHORT + r')\s+(.+?)\s+(' + USD_TOKEN + r')(?:\s+(' + USD_TOKEN + r'))?\s*$')


def normalized(value):
    value = unicodedata.normalize('NFKD', value)
    return ''.join(c for c in value if not unicodedata.combining(c)).upper()


def compact(value):
    return re.sub(r'\s+', ' ', value).strip()


def redact_pan(value):
    """Keep bank references intact; remove complete, Luhn-valid Visa/MC PANs."""
    if value is None:
        return None

    def redact(match):
        digits = re.sub(r'[^0-9]', '', match.group())
        visa = digits.startswith('4') and len(digits) in (13, 16, 19)
        mastercard = len(digits) == 16 and (51 <= int(digits[:2]) <= 55 or 2221 <= int(digits[:4]) <= 2720)
        if not visa and not mastercard:
            return match.group()
        checksum = 0
        for index, character in enumerate(reversed(digits)):
            number = int(character) * (2 if index % 2 else 1)
            checksum += number - 9 if number > 9 else number
        return '[tarjeta-' + digits[-4:] + ']' if checksum % 10 == 0 else match.group()

    # Exact lengths and group shapes keep an adjacent short numeric reference
    # separate. Numeric boundaries preserve longer contiguous operation codes.
    value = re.sub(r'(?<![0-9])(?:[0-9]{19}|[0-9]{16}|[0-9]{13})(?![0-9])', redact, value)
    grouped = r'[0-9]{4}[ -][0-9]{4}[ -][0-9]{4}[ -](?:[0-9]{4}[ -][0-9]{3}|[0-9]{4}|[0-9])'
    return re.sub(r'(?<![0-9])' + grouped + r'(?![0-9])', redact, value)


def issue(section, code):
    if code not in section['_issues']:
        section['_issues'].append(code)


def parse_date(value, short=False):
    try:
        parsed = datetime.strptime(value, '%d/%m/%y' if short else '%d/%m/%Y')
        return parsed.date().isoformat() if 2000 <= parsed.year <= 2100 else None
    except (ValueError, TypeError):
        return None


def money(value, currency):
    """Read printed Chilean integer/decimal notation into exact minor units."""
    pattern = r'-?(?:0|\d{1,3}(?:\.\d{3})+|\d+)' + (r',\d{2}' if currency == 'USD' else '')
    if not re.fullmatch(pattern, value):
        raise ValueError('INVALID_MONEY')
    digits = value.replace('.', '').replace(',', '')
    return int(digits)


def amount_string(value, currency):
    if value is None:
        return None
    if currency == 'CLP':
        return str(value)
    sign = '-' if value < 0 else ''
    value = abs(value)
    return f'{sign}{value // 100}.{value % 100:02d}'


def new_section(scope):
    return {'scope': scope, 'currency': 'CLP' if scope == 'national' else 'USD',
            '_issues': [], '_items': [], '_pending': [], '_groups': [], '_pages': [],
            '_stage': None, '_details': False, '_totals': {}, '_headers': {}}


def header(section, name, value):
    if value is None:
        issue(section, 'HEADER_DATE_INVALID')
    previous = section['_headers'].get(name)
    if previous is not None and previous != value:
        issue(section, 'SECTION_HEADER_MISMATCH')
    section['_headers'][name] = value


def set_total(section, name, raw):
    try:
        value = money(raw, section['currency'])
    except ValueError:
        issue(section, 'INVALID_MONEY')
        return
    if section['scope'] == 'international' and name == 'payments':
        value = -abs(value)
    if name in section['_totals'] and section['_totals'][name] != value:
        issue(section, 'DUPLICATE_TOTAL_MISMATCH')
    section['_totals'][name] = value


def make_item(section, page, date, description, reference, amount, operation_amount,
              installment_number=None, installment_total=None):
    stage = section['_stage']
    upper = normalized(description)
    if 'TRASPASO DEUDA' in upper:
        kind = 'debt_transfer'
    elif stage == 'payments' or 'MONTO CANCELADO' in upper or upper.startswith('PAGO '):
        kind = 'payment'
    elif amount < 0:
        kind = 'other_credit'
    elif installment_total and installment_total > 1:
        kind = 'installment'
    elif stage in ('charges', 'voluntary'):
        kind = 'fee'
    else:
        kind = 'purchase'
    description = redact_pan(compact(re.sub(r'\s+TASA\s+INT\..*$', '', description, flags=re.I)))
    reference = redact_pan(reference)
    index = len(section['_items']) + 1
    signature = [section['scope'], page, index, date, description, reference,
                 str(amount), str(operation_amount), installment_number, installment_total]
    item = {'rowKey': hashlib.sha256(json.dumps(signature, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest(),
            'page': page, 'date': date, 'description': description, 'reference': reference,
            'cardLastFour': None, 'kind': kind, 'currency': section['currency'],
            'amount': amount_string(amount, section['currency']),
            'operationAmount': amount_string(operation_amount, section['currency']),
            'installmentNumber': installment_number, 'installmentTotal': installment_total,
            '_minor': amount, '_bucket': stage}
    section['_items'].append(item)
    if stage == 'purchases':
        section['_pending'].append(item)
    if len(section['_items']) > MAX_ITEMS:
        raise ValueError('STATEMENT_ITEM_LIMIT')


def card_group(section, last_four, printed):
    try:
        expected = money(printed, section['currency'])
    except ValueError:
        issue(section, 'INVALID_MONEY')
        return
    rows = section['_pending']
    if sum(row['_minor'] for row in rows) != expected:
        issue(section, 'CARD_GROUP_TOTAL_MISMATCH')
    for row in rows:
        row['cardLastFour'] = last_four
    section['_groups'].append({'lastFour': last_four, 'minor': expected})
    section['_pending'] = []


def read_headers(section, line):
    upper = normalized(line)
    if re.search(r'N(?:[°O]|UMERO)\s+DE\s+TARJETA\s+DE\s+CREDITO', upper):
        match = re.search(r'(\d{4})\s*$', line)
        if match:
            header(section, 'mainCardLastFour', match.group(1))
    if 'FECHA ESTADO DE CUENTA' in upper:
        match = re.search(DATE_LONG, line)
        if match:
            header(section, 'statementDate', parse_date(match.group()))
    if section['scope'] == 'national' and 'PERIODO FACTURADO' in upper:
        dates = re.findall(DATE_LONG, line)
        if len(dates) == 2:
            header(section, 'since', parse_date(dates[0]))
            header(section, 'until', parse_date(dates[1]))
    if section['scope'] == 'international':
        for label, name in [('PERIODO FACTURADO DESDE', 'since'), ('PERIODO FACTURADO HASTA', 'until')]:
            if label in upper:
                dates = re.findall(DATE_LONG, line)
                if dates:
                    header(section, name, parse_date(dates[-1]))
    if 'PAGAR HASTA' in upper:
        dates = re.findall(DATE_LONG, line)
        if dates:
            header(section, 'dueDate', parse_date(dates[-1]))


def read_national(section, line, page):
    upper = normalized(line)
    mapping = [
        ('MONTO FACTURADO A PAGAR (PERIODO ANTERIOR)', 'previousBilled'),
        ('TOTAL PAGOS A LA CUENTA', 'payments'),
        ('TOTAL PAT A LA CUENTA', 'automaticPayments'),
        ('TOTAL TRANSACCIONES EN UNA CUOTA', 'purchases'),
        ('TOTAL TRANSACCIONES EN CUOTAS', 'installments'),
        ('TOTAL PRODUCTOS O SERVICIOS VOLUNTARIAMENTE CONTRATADOS', 'voluntaryServices'),
        ('TOTAL CARGOS, COMISIONES, IMPUESTOS Y ABONOS', 'charges'),
    ]
    for label, name in mapping:
        if label in upper:
            match = re.search(r'\$\s*(' + CLP_TOKEN + r')\s*$', line)
            if match:
                set_total(section, name, match.group(1))
    if 'MONTO TOTAL FACTURADO A PAGAR' in upper and re.search(r'A\s*\+\s*B\s*\+\s*C\s*\+\s*D\s*\+\s*E\s*\+\s*F\s*\+\s*G', upper):
        match = re.search(r'\$\s*(' + CLP_TOKEN + r')', line)
        if match:
            set_total(section, 'billedTotal', match.group(1))
    if re.search(r'2\.\s*PERIODO ACTUAL', upper):
        section['_details'] = True
        if section['_stage'] is None:
            section['_stage'] = 'payments'
    if 'TOTAL PAGOS A LA CUENTA' in upper:
        section['_stage'] = 'automaticPayments'
    elif 'TOTAL PAT A LA CUENTA' in upper:
        section['_stage'] = 'purchases'
    elif 'TOTAL TRANSACCIONES EN UNA CUOTA' in upper:
        if section['_pending']:
            issue(section, 'CARD_GROUP_UNRESOLVED')
            section['_pending'] = []
        section['_stage'] = 'installments'
    elif 'TOTAL TRANSACCIONES EN CUOTAS' in upper:
        section['_stage'] = 'voluntary'
    elif 'TOTAL PRODUCTOS O SERVICIOS VOLUNTARIAMENTE CONTRATADOS' in upper or re.search(r'3\.\s*CARGOS, COMISIONES', upper):
        section['_stage'] = 'charges'
    elif 'TOTAL CARGOS, COMISIONES, IMPUESTOS Y ABONOS' in upper:
        section['_stage'] = 'complete'
    if re.search(r'III\.\s*INFORMACION DE PAGO', upper):
        section['_details'] = False
    group = re.search(r'TOTAL\s+TARJETA\s+.*?(\d{4})\s+\$\s*(' + CLP_TOKEN + r')\s*$', line, re.I)
    if group:
        card_group(section, group.group(1), group.group(2))
        return
    if 'COMPROBANTE DE PAGO' in upper:
        section['_details'] = False
    if not section['_details']:
        return
    if not re.search(DATE_SHORT, line):
        if line.count('$') >= 3 and re.search(r'\d{1,3}/\d{1,3}', line):
            issue(section, 'UNPARSED_TRANSACTION_ROW')
        return
    match = NATIONAL_ROW.search(line)
    if not match:
        issue(section, 'UNPARSED_TRANSACTION_ROW')
        return
    date = parse_date(match.group(1), short=True)
    if not date:
        issue(section, 'TRANSACTION_DATE_INVALID')
        return
    try:
        operation_amount = money(match.group(4), 'CLP')
        total_amount = money(match.group(5), 'CLP')
        amount = money(match.group(8), 'CLP')
        number, total = int(match.group(6)), int(match.group(7))
    except ValueError:
        issue(section, 'INVALID_MONEY')
        return
    if not 1 <= number <= total <= 999:
        issue(section, 'INSTALLMENT_NUMBER_INVALID')
    if total == 1 and not operation_amount == total_amount == amount:
        issue(section, 'SINGLE_PAYMENT_AMOUNT_MISMATCH')
    if section['_stage'] in (None, 'complete'):
        issue(section, 'TRANSACTION_SECTION_UNRESOLVED')
    make_item(section, page, date, match.group(3), match.group(2), amount,
              operation_amount, number, total)


def read_international(section, line, page):
    upper = normalized(line)
    mapping = [
        ('SALDO ANTERIOR FACTURADO', 'previousBilled'), ('ABONO REALIZADO', 'credited'),
        ('TRASPASO DEUDA NACIONAL', 'transferToNational'), ('DEUDA TOTAL', 'debtTotal'),
        ('TOTAL DE PAGOS', 'payments'), ('TOTAL DE COMPRAS', 'purchases'),
        ('COMISIONES, OTROS CARGOS Y ABONOS A LA CUENTA', 'charges'),
    ]
    for label, name in mapping:
        if label in upper:
            match = re.search(r'US\$\s*(' + USD_TOKEN + r')', line)
            if match:
                set_total(section, name, match.group(1))
    if re.search(r'2\.\s*INFORMACION DE TRANSACCIONES', upper):
        section['_details'] = True
        if section['_stage'] is None:
            section['_stage'] = 'payments'
    if 'TOTAL DE PAGOS' in upper or 'TOTAL DE COMPRAS' in upper:
        section['_stage'] = 'purchases'
    if 'COMISIONES, OTROS CARGOS Y ABONOS A LA CUENTA' in upper:
        if section['_pending']:
            issue(section, 'CARD_GROUP_UNRESOLVED')
            section['_pending'] = []
        section['_stage'] = 'charges'
    group = re.search(r'TOTAL\s+TARJETA\s+.*?(\d{4})\s+(?:US\$\s*)?(' + USD_TOKEN + r')\s*$', line, re.I)
    if group:
        card_group(section, group.group(1), group.group(2))
        return
    if 'COMPROBANTE DE PAGO' in upper:
        section['_details'] = False
    if not section['_details']:
        return
    if not re.search(DATE_SHORT, line):
        if len(re.findall(USD_TOKEN, line)) >= 2 or (re.match(r'^\s*\d{4}\s+', line) and re.search(USD_TOKEN + r'\s*$', line)):
            issue(section, 'UNPARSED_TRANSACTION_ROW')
        return
    match = INTERNATIONAL_ROW.match(line)
    if not match:
        issue(section, 'UNPARSED_TRANSACTION_ROW')
        return
    date = parse_date(match.group(3), short=True)
    if not date:
        issue(section, 'TRANSACTION_DATE_INVALID')
        return
    if section['_stage'] != 'charges' and not match.group(2):
        issue(section, 'REFERENCE_UNRESOLVED')
    try:
        operation = money(match.group(5), 'USD')
        amount = money(match.group(6) or match.group(5), 'USD')
    except ValueError:
        issue(section, 'INVALID_MONEY')
        return
    description = compact(re.sub(r'\s+[A-Z]{2}\s*$', '', match.group(4)))
    make_item(section, page, date, description, match.group(2) or match.group(1), amount, operation)


def validate_international_effects(section):
    """Verify summary credits/transfers only against known signed row effects."""
    totals, rows = section['_totals'], section['_items']
    payment_rows = [row for row in rows if row['kind'] == 'payment']
    if (any(row['_bucket'] != 'payments' or row['_minor'] >= 0 for row in payment_rows)
            or any(row['kind'] == 'other_credit' for row in rows)):
        # A refund/adjustment is not assumed to have the same summary semantics
        # as a payment merely because both reduce the balance.
        issue(section, 'INTERNATIONAL_CREDIT_SEMANTICS_UNVERIFIABLE')
    elif 'credited' in totals and totals['credited'] != -sum(row['_minor'] for row in payment_rows):
        issue(section, 'INTERNATIONAL_CREDITED_TOTAL_MISMATCH')
    transfers = [row for row in rows if row['kind'] == 'debt_transfer']
    if any(row['_bucket'] != 'charges' or row['_minor'] >= 0
           or not re.fullmatch(r'TRASPASO DEUDA (?:INTERNACIONAL|NACIONAL)', normalized(row['description']))
           for row in transfers):
        issue(section, 'INTERNATIONAL_TRANSFER_SEMANTICS_UNVERIFIABLE')
    elif 'transferToNational' in totals and totals['transferToNational'] != -sum(row['_minor'] for row in transfers):
        issue(section, 'INTERNATIONAL_TRANSFER_TOTAL_MISMATCH')


def finish_section(section):
    headers = section['_headers']
    for required in ['mainCardLastFour', 'statementDate', 'since', 'until', 'dueDate']:
        if not headers.get(required):
            issue(section, 'HEADER_INCOMPLETE')
    if headers.get('since') and headers.get('until') and headers['since'] > headers['until']:
        issue(section, 'PERIOD_INVALID')
    if headers.get('dueDate') and headers.get('until') and headers['dueDate'] < headers['until']:
        issue(section, 'PERIOD_INVALID')
    pages = section['_pages']
    if not pages or len(set(total for _, total in pages)) != 1 or [number for number, _ in pages] != list(range(1, pages[0][1] + 1)):
        issue(section, 'PAGE_COVERAGE_INCOMPLETE')
    if section['_pending']:
        issue(section, 'CARD_GROUP_UNRESOLVED')
    totals = section['_totals']
    if section['scope'] == 'national':
        keys = ['previousBilled', 'payments', 'automaticPayments', 'purchases', 'installments', 'voluntaryServices', 'charges', 'billedTotal']
        buckets = [('payments', 'payments', 'NATIONAL_PAYMENTS_TOTAL_MISMATCH'),
                   ('automaticPayments', 'automaticPayments', 'NATIONAL_AUTOMATIC_PAYMENTS_TOTAL_MISMATCH'),
                   ('purchases', 'purchases', 'NATIONAL_PURCHASES_TOTAL_MISMATCH'),
                   ('installments', 'installments', 'NATIONAL_INSTALLMENTS_TOTAL_MISMATCH'),
                   ('voluntary', 'voluntaryServices', 'NATIONAL_VOLUNTARY_TOTAL_MISMATCH'),
                   ('charges', 'charges', 'NATIONAL_CHARGES_TOTAL_MISMATCH')]
        for bucket, key, code in buckets:
            if key in totals and sum(row['_minor'] for row in section['_items'] if row['_bucket'] == bucket) != totals[key]:
                issue(section, code)
        if all(key in totals for key in keys) and sum(totals[key] for key in keys[:-1]) != totals['billedTotal']:
            issue(section, 'NATIONAL_BILLED_TOTAL_MISMATCH')
    else:
        keys = ['previousBilled', 'payments', 'purchases', 'charges', 'debtTotal', 'credited', 'transferToNational']
        for bucket, key, code in [('payments', 'payments', 'INTERNATIONAL_PAYMENTS_TOTAL_MISMATCH'),
                                  ('purchases', 'purchases', 'INTERNATIONAL_PURCHASES_TOTAL_MISMATCH'),
                                  ('charges', 'charges', 'INTERNATIONAL_CHARGES_TOTAL_MISMATCH')]:
            if key in totals and sum(row['_minor'] for row in section['_items'] if row['_bucket'] == bucket) != totals[key]:
                issue(section, code)
        equation = ['previousBilled', 'payments', 'purchases', 'charges', 'debtTotal']
        if all(key in totals for key in equation) and sum(totals[key] for key in equation[:-1]) != totals['debtTotal']:
            issue(section, 'INTERNATIONAL_DEBT_TOTAL_MISMATCH')
        validate_international_effects(section)
    if not all(key in totals for key in keys):
        issue(section, 'TOTALS_INCOMPLETE')
    return {'scope': section['scope'], 'currency': section['currency'],
            'totals': {key: amount_string(totals.get(key), section['currency']) for key in keys},
            'validation': {'valid': not section['_issues'], 'issues': section['_issues']},
            'items': [{key: value for key, value in item.items() if not key.startswith('_')} for item in section['_items']]}


def parse_pages(pages, filename):
    if not isinstance(pages, list) or not pages or len(pages) > MAX_PAGES or not all(isinstance(p, str) for p in pages):
        raise ValueError('STATEMENT_PAGE_LIMIT')
    if sum(len(p) for p in pages) > MAX_TEXT_CHARS:
        raise ValueError('STATEMENT_TEXT_LIMIT')
    network_hint = [name for name in ['visa', 'mastercard'] if name in filename.lower()]
    network = network_hint[0] if len(network_hint) == 1 else None
    issues = [] if network else ['NETWORK_UNRESOLVED']
    sections = []
    current = None
    for page_index, page in enumerate(pages, 1):
        lines = page.splitlines()
        page_upper = normalized(page)
        header_lines = normalized('\n'.join(lines[:22]))
        brands = [name for name in ['visa', 'mastercard'] if re.search(r'\b' + name.upper() + r'\b', header_lines)]
        if brands and (len(brands) != 1 or (network is not None and network != brands[0])):
            if 'NETWORK_CONFLICT' not in issues:
                issues.append('NETWORK_CONFLICT')
        elif not network and len(brands) == 1:
            network = brands[0]
            issues = [code for code in issues if code != 'NETWORK_UNRESOLVED']
        scope = 'international' if 'ESTADO DE CUENTA INTERNACIONAL DE TARJETA' in page_upper else 'national' if 'ESTADO DE CUENTA NACIONAL DE TARJETA' in page_upper else None
        if scope:
            existing = next((s for s in sections if s['scope'] == scope), None)
            if existing:
                current = existing
            else:
                current = new_section(scope)
                sections.append(current)
        if current is None:
            if 'PAGE_LAYOUT_UNRECOGNIZED' not in issues:
                issues.append('PAGE_LAYOUT_UNRECOGNIZED')
            continue
        numbering = re.search(r'^\s*(\d+)\s+de\s+(\d+)\s*$', '\n'.join(lines[:10]), re.I | re.M)
        if numbering:
            current['_pages'].append((int(numbering.group(1)), int(numbering.group(2))))
        else:
            issue(current, 'PAGE_COVERAGE_INCOMPLETE')
        for line in lines:
            read_headers(current, line)
            if current['scope'] == 'national':
                read_national(current, line, page_index)
            else:
                read_international(current, line, page_index)
    primary = sections[0]['_headers'] if sections else {}
    for section in sections[1:]:
        if any(section['_headers'].get(key) != primary.get(key) for key in ['mainCardLastFour', 'statementDate', 'since', 'until', 'dueDate']):
            issue(section, 'SECTION_HEADER_MISMATCH')
    results = [finish_section(section) for section in sections]
    for result in results:
        for code in result['validation']['issues']:
            if code not in issues:
                issues.append(code)
    if not results:
        issues.append('STATEMENT_LAYOUT_UNSUPPORTED')
    return {'version': 1, 'network': network, 'mainCardLastFour': primary.get('mainCardLastFour'),
            'statementDate': primary.get('statementDate'), 'period': {'since': primary.get('since'), 'until': primary.get('until')},
            'dueDate': primary.get('dueDate'), 'sections': results, 'validation': {'valid': not issues, 'issues': issues}}


def extract_pdf(payload):
    if not isinstance(payload, dict) or set(payload) - {'pdfBase64', 'password', 'filename'}:
        raise ValueError('STATEMENT_INVALID_INPUT')
    encoded, password, filename = payload.get('pdfBase64'), payload.get('password'), payload.get('filename')
    if not isinstance(encoded, str) or not isinstance(password, str) or len(password) > 1024 or not isinstance(filename, str) or not 1 <= len(filename) <= 255:
        raise ValueError('STATEMENT_INVALID_INPUT')
    if len(encoded) > (MAX_PDF_BYTES + 2) * 4 // 3 + 4:
        raise ValueError('STATEMENT_PDF_SIZE_LIMIT')
    try:
        buffer = base64.b64decode(encoded, validate=True)
    except (ValueError, TypeError):
        raise ValueError('STATEMENT_PDF_INVALID') from None
    if not buffer.startswith(b'%PDF-') or len(buffer) > MAX_PDF_BYTES:
        raise ValueError('STATEMENT_PDF_INVALID')
    import pdfplumber
    from pdfminer.pdfdocument import PDFPasswordIncorrect
    try:
        with pdfplumber.open(io.BytesIO(buffer), password=password) as pdf:
            if not 1 <= len(pdf.pages) <= MAX_PAGES:
                raise ValueError('STATEMENT_PAGE_LIMIT')
            pages = [page.extract_text(layout=True) or '' for page in pdf.pages]
    except PDFPasswordIncorrect:
        raise ValueError('STATEMENT_PDF_PASSWORD_INVALID') from None
    except ValueError:
        raise
    except Exception as error:
        cause = error
        for _ in range(4):
            if isinstance(cause, PDFPasswordIncorrect):
                raise ValueError('STATEMENT_PDF_PASSWORD_INVALID') from None
            cause = getattr(cause, '__cause__', None) or getattr(cause, '__context__', None)
            if cause is None:
                break
        raise ValueError('STATEMENT_PDF_INVALID') from None
    if not pages or any(len(page.strip()) < 50 for page in pages):
        raise ValueError('STATEMENT_TEXT_UNAVAILABLE')
    return parse_pages(pages, filename)


def main():
    logging.getLogger('pdfminer').setLevel(logging.ERROR)
    try:
        raw = sys.stdin.buffer.read(MAX_PDF_BYTES * 2 + 1)
        if len(raw) > MAX_PDF_BYTES * 2:
            raise ValueError('STATEMENT_PDF_SIZE_LIMIT')
        payload = json.loads(raw)
        result = extract_pdf(payload)
        sys.stdout.write(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
        return 0
    except Exception as error:
        code = str(error) if isinstance(error, ValueError) and re.fullmatch(r'STATEMENT_[A-Z_]+', str(error)) else 'STATEMENT_INVALID_INPUT'
        sys.stdout.write(json.dumps({'error': {'code': code}}, separators=(',', ':')) + '\n')
        return 1


if __name__ == '__main__':
    sys.exit(main())
