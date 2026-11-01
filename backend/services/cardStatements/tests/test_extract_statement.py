"""Fictitious statement contract fixtures. Never reads customer files or .env."""
import base64
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import unittest
from reportlab.pdfgen import canvas
from reportlab.lib.pdfencrypt import StandardEncryption

MODULE = Path(__file__).parents[1] / 'extract_statement.py'

def national_pages():
    return ["""1 de 2
ESTADO DE CUENTA NACIONAL DE TARJETA DE CRÉDITO
NOMBRE DEL TITULAR TITULAR FICTICIO PRIVADO
N° DE TARJETA DE CRÉDITO XXXX XXXX XXXX 1234
FECHA ESTADO DE CUENTA 22/05/2030
PERÍODO FACTURADO 23/04/2030 22/05/2030
PAGAR HASTA 05/06/2030
MONTO FACTURADO A PAGAR (PERÍODO ANTERIOR) A $ 1.000
2. PERÍODO ACTUAL
LUGAR DE FECHA CÓDIGO DESCRIPCIÓN OPERACIÓN O COBRO MONTO MONTO CARGOS DEL MES
OPERACIÓN OPERACIÓN REFERENCIA OPERACIÓN TOTAL A N° VALOR CUOTA
1.TOTAL OPERACIONES
06/05/30 111111111111 MONTO CANCELADO $ -1.000 $ -1.000 01/01 $ -1.000
TOTAL PAGOS A LA CUENTA B $ -1.000
Sin Movimientos
TOTAL PAT A LA CUENTA C $ 0
CIUDAD 07/05/30 222222222221 COMERCIO FICTICIO UNO CIUDAD $ 100 $ 100 01/01 $ 100
CIUDAD 07/05/30 222222222222 COMERCIO FICTICIO UNO CIUDAD $ 100 $ 100 01/01 $ 100
TOTAL TARJETA XXXX XXXX XXXX 1234 $ 200
""", """2 de 2
2. PERÍODO ACTUAL
CIUDAD 08/05/30 333333333333 COMERCIO FICTICIO DOS CIUDAD $ 250 $ 250 01/01 $ 250
TOTAL TARJETA XXXX XXXX XXXX 5678 $ 250
TOTAL TRANSACCIONES EN UNA CUOTA D $ 450
CIUDAD 10/04/30 444444444444 TIENDA CUOTAS TASA INT. 0,00% $ 600 $ 600 02/03 $ 200
TOTAL TRANSACCIONES EN CUOTAS E $ 200
TOTAL PRODUCTOS O SERVICIOS VOLUNTARIAMENTE CONTRATADOS F $ 0
3.CARGOS, COMISIONES, IMPUESTOS Y ABONOS
22/05/30 555555555555 COMISION ADMINISTRACION MENSUAL $ 30 $ 30 01/01 $ 30
20/05/30 666666666666 DEVOLUCION COMERCIO $ -10 $ -10 01/01 $ -10
11/05/30 777777777777 TRASPASO DEUDA INTERNACIONAL $ 60 $ 60 01/01 $ 60
TOTAL CARGOS, COMISIONES, IMPUESTOS Y ABONOS G $ 80
III. INFORMACIÓN DE PAGO
MONTO TOTAL FACTURADO A PAGAR ( A+B+C+D+E+F+G) $ 730 EVOLUCIÓN MONTOS FACTURADOS Y PAGADOS
"""]

def international_pages():
    return ["""1 de 2
ESTADO DE CUENTA INTERNACIONAL DE TARJETA DE CREDITO
N° DE TARJETA DE CREDITO XXXX XXXX XXXX 1234
FECHA ESTADO DE CUENTA 22/05/2030
II. DETALLE
1. INFORMACIÓN DE PAGO
SALDO ANTERIOR FACTURADO US$ 20,00 PERIODO FACTURADO DESDE 23/04/2030
ABONO REALIZADO US$ 0,00 PERIODO FACTURADO HASTA 22/05/2030
TRASPASO DEUDA NACIONAL US$ 20,00 PAGAR HASTA 05/06/2030
DEUDA TOTAL US$ 6,00
2. INFORMACIÓN DE TRANSACCIONES
NÚMERO REFERENCIA FECHA DESCRIPCIÓN OPERACIÓN O COBRO CIUDAD PAÍS MONTO MONTO US$
INTERNACIONAL OPERACIÓN MONEDA
TOTAL DE PAGOS US$ 0,00
TOTAL DE COMPRAS US$ 6,00
0805 11111111111111111111111 07/05/30 SERVICIO WEB CIUDAD US 2.000,00 2,00
0905 22222222222222222222222 08/05/30 OTRO SERVICIO CIUDAD IE 4,00 4,00
""", """2 de 2
2. INFORMACIÓN DE TRANSACCIONES
TOTAL TARJETA XXXX XXXX XXXX 1234 6,00
COMISIONES, OTROS CARGOS Y ABONOS A LA CUENTA US$ -20,00
1105 11/05/30 TRASPASO DEUDA INTERNACIONAL CL -20,00
"""]

def make_pdf(pages, password='fixture-only'):
    out=io.BytesIO()
    pdf=canvas.Canvas(out,encrypt=StandardEncryption(password) if password else None)
    for page in pages:
        pdf.setFont('Courier',7)
        for index,line in enumerate(page.splitlines()): pdf.drawString(15,825-index*11,line)
        pdf.showPage()
    pdf.save()
    return out.getvalue()

class ParserContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec=importlib.util.spec_from_file_location('extract_statement',MODULE)
        cls.module=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.module)

    def parse(self,pages=None,filename='EECCTarjetaVisa.pdf'):
        return self.module.parse_pages(pages if pages is not None else national_pages()+international_pages(),filename)

    def test_both_sections_header_and_real_due_period(self):
        result=self.parse()
        self.assertTrue(result['validation']['valid'],result['validation'])
        self.assertEqual(result['network'],'visa')
        self.assertEqual(result['mainCardLastFour'],'1234')
        self.assertEqual(result['period'],{'since':'2030-04-23','until':'2030-05-22'})
        self.assertEqual(result['statementDate'],'2030-05-22')
        self.assertEqual(result['dueDate'],'2030-06-05')
        self.assertEqual([s['currency'] for s in result['sections']],['CLP','USD'])

    def test_exact_monthly_installment_and_operation_total(self):
        section=self.parse()['sections'][0]
        row=next(r for r in section['items'] if r['kind']=='installment')
        self.assertEqual(row['amount'],'200')
        self.assertEqual(row['operationAmount'],'600')
        self.assertEqual((row['installmentNumber'],row['installmentTotal']),(2,3))
        self.assertIsNone(row['cardLastFour'])
        self.assertNotIn('TASA INT',row['description'])

    def test_additional_card_groups_are_assigned_retroactively(self):
        items=self.parse()['sections'][0]['items']
        main=[r for r in items if r['kind']=='purchase' and r['cardLastFour']=='1234']
        extra=[r for r in items if r['kind']=='purchase' and r['cardLastFour']=='5678']
        self.assertEqual(len(main),2)
        self.assertEqual(len(extra),1)
        self.assertEqual(len(set(r['rowKey'] for r in main)),2)
        self.assertEqual([r['amount']for r in main],['100','100'])

    def test_payments_refunds_and_debt_transfers_are_not_purchases(self):
        rows=self.parse()['sections'][0]['items']
        self.assertEqual(next(r for r in rows if r['kind']=='payment')['amount'],'-1000')
        self.assertEqual(next(r for r in rows if r['kind']=='other_credit')['amount'],'-10')
        self.assertEqual(next(r for r in rows if r['kind']=='debt_transfer')['amount'],'60')
        self.assertEqual(next(r for r in rows if r['kind']=='fee')['amount'],'30')

    def test_usd_original_amount_and_billed_amount_are_distinct(self):
        section=self.parse()['sections'][1]
        row=next(r for r in section['items'] if r['kind']=='purchase')
        self.assertEqual(row['amount'],'2.00')
        self.assertEqual(row['operationAmount'],'2000.00')
        self.assertEqual(row['reference'],'11111111111111111111111')
        self.assertEqual(row['cardLastFour'],'1234')
        self.assertEqual(section['totals']['charges'],'-20.00')
        self.assertEqual(section['totals']['debtTotal'],'6.00')

    def test_national_totals_are_signed_exact_strings(self):
        totals=self.parse()['sections'][0]['totals']
        self.assertEqual(totals,{'previousBilled':'1000','payments':'-1000','automaticPayments':'0','purchases':'450','installments':'200','voluntaryServices':'0','charges':'80','billedTotal':'730'})

    def test_national_subtotal_difference_prevents_valid_result(self):
        pages=national_pages();pages[1]=pages[1].replace('CUOTA D $ 450','CUOTA D $ 451')
        self.assertFalse(self.parse(pages)['validation']['valid'])
        self.assertIn('NATIONAL_PURCHASES_TOTAL_MISMATCH',self.parse(pages)['validation']['issues'])

    def test_national_equation_difference_prevents_valid_result(self):
        pages=national_pages();pages[1]=pages[1].replace('$ 730 EVOLUCIÓN','$ 731 EVOLUCIÓN')
        self.assertIn('NATIONAL_BILLED_TOTAL_MISMATCH',self.parse(pages)['validation']['issues'])

    def test_group_subtotal_difference_is_detected(self):
        pages=national_pages();pages[0]=pages[0].replace('1234 $ 200','1234 $ 201')
        self.assertIn('CARD_GROUP_TOTAL_MISMATCH',self.parse(pages)['validation']['issues'])

    def test_usd_purchase_and_debt_equations_are_validated(self):
        pages=international_pages();pages[0]=pages[0].replace('DEUDA TOTAL US$ 6,00','DEUDA TOTAL US$ 7,00')
        result=self.parse(pages)
        self.assertIn('INTERNATIONAL_DEBT_TOTAL_MISMATCH',result['validation']['issues'])
        pages=international_pages();pages[0]=pages[0].replace('COMPRAS US$ 6,00','COMPRAS US$ 7,00')
        self.assertIn('INTERNATIONAL_PURCHASES_TOTAL_MISMATCH',self.parse(pages)['validation']['issues'])

    def test_usd_credited_and_transfer_summaries_must_match_rows(self):
        for before,after,code in [
            ('ABONO REALIZADO US$ 0,00','ABONO REALIZADO US$ 99,00','INTERNATIONAL_CREDITED_TOTAL_MISMATCH'),
            ('TRASPASO DEUDA NACIONAL US$ 20,00','TRASPASO DEUDA NACIONAL US$ 999,00','INTERNATIONAL_TRANSFER_TOTAL_MISMATCH'),
        ]:
            with self.subTest(code=code):
                pages=international_pages();pages[0]=pages[0].replace(before,after)
                result=self.parse(pages)
                self.assertFalse(result['validation']['valid'])
                self.assertIn(code,result['validation']['issues'])

    def test_usd_known_payment_and_transfer_effects_validate_exactly(self):
        pages=international_pages()
        pages[0]=pages[0].replace('ABONO REALIZADO US$ 0,00','ABONO REALIZADO US$ 5,00')
        pages[0]=pages[0].replace('TRASPASO DEUDA NACIONAL US$ 20,00','TRASPASO DEUDA NACIONAL US$ 15,00')
        pages[0]=pages[0].replace('TOTAL DE PAGOS US$ 0,00',
            '0605 999999999991 06/05/30 MONTO CANCELADO CL -5,00 -5,00\nTOTAL DE PAGOS US$ 5,00')
        pages[1]=pages[1].replace('-20,00','-15,00')
        result=self.parse(pages)
        self.assertTrue(result['validation']['valid'],result['validation'])
        self.assertEqual(result['sections'][0]['totals']['payments'],'-5.00')

    def test_usd_positive_payment_effect_is_not_verified_as_credit(self):
        pages=international_pages()
        pages[0]=pages[0].replace('TOTAL DE PAGOS US$ 0,00',
            '0605 999999999991 06/05/30 MONTO CANCELADO CL 5,00 5,00\nTOTAL DE PAGOS US$ 5,00')
        result=self.parse(pages)
        self.assertIn('INTERNATIONAL_CREDIT_SEMANTICS_UNVERIFIABLE',result['validation']['issues'])

    def test_usd_credited_and_transfer_header_signs_are_not_normalized(self):
        pages=international_pages()
        pages[0]=pages[0].replace('ABONO REALIZADO US$ 0,00','ABONO REALIZADO US$ -5,00')
        pages[0]=pages[0].replace('TRASPASO DEUDA NACIONAL US$ 20,00','TRASPASO DEUDA NACIONAL US$ -15,00')
        pages[0]=pages[0].replace('TOTAL DE PAGOS US$ 0,00',
            '0605 999999999991 06/05/30 MONTO CANCELADO CL -5,00 -5,00\nTOTAL DE PAGOS US$ 5,00')
        pages[1]=pages[1].replace('-20,00','-15,00')
        result=self.parse(pages)
        self.assertEqual(result['sections'][0]['totals']['credited'],'-5.00')
        self.assertEqual(result['sections'][0]['totals']['transferToNational'],'-15.00')
        self.assertIn('INTERNATIONAL_CREDITED_TOTAL_MISMATCH',result['validation']['issues'])
        self.assertIn('INTERNATIONAL_TRANSFER_TOTAL_MISMATCH',result['validation']['issues'])

    def test_usd_offsetting_payments_cannot_hide_unknown_signs(self):
        pages=international_pages()
        pages[0]=pages[0].replace('TOTAL DE PAGOS US$ 0,00',
            '0605 999999999991 06/05/30 MONTO CANCELADO CL -5,00 -5,00\n'
            '0605 999999999992 06/05/30 MONTO CANCELADO CL 5,00 5,00\nTOTAL DE PAGOS US$ 0,00')
        result=self.parse(pages)
        self.assertIn('INTERNATIONAL_CREDIT_SEMANTICS_UNVERIFIABLE',result['validation']['issues'])

    def test_usd_offsetting_transfers_cannot_hide_unknown_signs(self):
        pages=international_pages()
        pages[1]+='\n1205 12/05/30 TRASPASO DEUDA INTERNACIONAL CL -1,00\n'
        pages[1]+='1305 13/05/30 TRASPASO DEUDA INTERNACIONAL CL 1,00\n'
        result=self.parse(pages)
        self.assertIn('INTERNATIONAL_TRANSFER_SEMANTICS_UNVERIFIABLE',result['validation']['issues'])

    def test_usd_unknown_credit_effect_cannot_appear_verified(self):
        pages=international_pages()
        pages[0]=pages[0].replace('TRASPASO DEUDA NACIONAL US$ 20,00','TRASPASO DEUDA NACIONAL US$ 19,00')
        pages[1]=pages[1].replace('CL -20,00','CL -19,00')
        pages[1]+='\n1205 999999999992 12/05/30 AJUSTE DESCONOCIDO CL -1,00 -1,00\n'
        result=self.parse(pages)
        self.assertIn('INTERNATIONAL_CREDIT_SEMANTICS_UNVERIFIABLE',result['validation']['issues'])
        self.assertFalse(result['validation']['valid'])

    def test_usd_unknown_transfer_semantics_cannot_appear_verified(self):
        pages=international_pages();pages[1]=pages[1].replace('TRASPASO DEUDA INTERNACIONAL','TRASPASO DEUDA DESCONOCIDA')
        result=self.parse(pages)
        self.assertIn('INTERNATIONAL_TRANSFER_SEMANTICS_UNVERIFIABLE',result['validation']['issues'])
        self.assertFalse(result['validation']['valid'])

    def test_missing_page_is_not_silent(self):
        result=self.parse([national_pages()[0]])
        self.assertFalse(result['validation']['valid'])
        self.assertIn('PAGE_COVERAGE_INCOMPLETE',result['validation']['issues'])

    def test_unrecognized_transaction_line_is_not_silently_dropped(self):
        pages=national_pages();pages[1]=pages[1].replace('08/05/30 333333333333','08/05/30 BADREF')
        self.assertIn('UNPARSED_TRANSACTION_ROW',self.parse(pages)['validation']['issues'])

    def test_offsetting_rows_without_dates_cannot_hide_behind_valid_totals(self):
        pages=national_pages()
        pages[1]=pages[1].replace('TOTAL CARGOS, COMISIONES, IMPUESTOS Y ABONOS G $ 80',
            'SIN FECHA 888888888881 CARGO PERDIDO $ 10 $ 10 01/01 $ 10\n'
            'SIN FECHA 888888888882 ABONO PERDIDO $ -10 $ -10 01/01 $ -10\n'
            'TOTAL CARGOS, COMISIONES, IMPUESTOS Y ABONOS G $ 80')
        self.assertIn('UNPARSED_TRANSACTION_ROW',self.parse(pages)['validation']['issues'])

    def test_offsetting_international_rows_without_dates_cannot_be_omitted(self):
        pages=international_pages()
        pages[1]+='\n1105 999999999991 SIN FECHA OTRO CARGO US 1,00 1,00\n1105 999999999992 SIN FECHA ABONO US -1,00 -1,00\n'
        self.assertIn('UNPARSED_TRANSACTION_ROW',self.parse(pages)['validation']['issues'])

    def test_payment_coupon_rows_are_not_transaction_rows(self):
        pages=national_pages()+international_pages()
        pages[0]+='\nCOMPROBANTE DE PAGO\n05/06/2030 US$6,00 05/06/2030 US$6,00\n'
        pages[2]+='\nCOMPROBANTE DE PAGO\n05/06/2030 US$6,00 05/06/2030 US$6,00\n'
        self.assertTrue(self.parse(pages)['validation']['valid'])

    def test_alternative_number_label_keeps_last_four(self):
        pages=national_pages()
        pages[0]=pages[0].replace('N° DE TARJETA','Nº DE TARJETA')
        self.assertEqual(self.parse(pages)['mainCardLastFour'],'1234')

    def test_bad_dates_are_flagged(self):
        pages=national_pages();pages[1]=pages[1].replace('08/05/30','31/02/30')
        self.assertFalse(self.parse(pages)['validation']['valid'])

    def test_header_conflict_is_flagged(self):
        pages=national_pages()+international_pages();pages[2]=pages[2].replace('22/05/2030','21/05/2030')
        self.assertIn('SECTION_HEADER_MISMATCH',self.parse(pages)['validation']['issues'])

    def test_unknown_filename_network_stays_unresolved(self):
        result=self.parse(filename='estado.pdf')
        self.assertIsNone(result['network'])
        self.assertIn('NETWORK_UNRESOLVED',result['validation']['issues'])

    def test_network_hint_conflicting_header_is_rejected(self):
        pages=national_pages();pages[0]='VISA\n'+pages[0]
        result=self.parse(pages,filename='EECCTarjetaMastercard.pdf')
        self.assertIn('NETWORK_CONFLICT',result['validation']['issues'])

    def test_no_customer_identity_or_full_text_in_dto(self):
        encoded=json.dumps(self.parse(),ensure_ascii=False)
        self.assertNotIn('TITULAR FICTICIO PRIVADO',encoded)
        self.assertNotIn('NOMBRE DEL TITULAR',encoded)
        self.assertNotIn('ESTADO DE CUENTA',encoded)

    def test_luhn_visa_and_mastercard_pan_are_redacted_before_dto(self):
        for pan in ['4222222222222','4111111111111111','4000000000000000006',
                    '5555555555554444','2221000000000009']:
            with self.subTest(length=len(pan),prefix=pan[:2]):
                pages=national_pages()
                pages[0]=pages[0].replace('222222222221',pan).replace('COMERCIO FICTICIO UNO','COMERCIO '+pan,1)
                result=self.parse(pages)
                self.assertTrue(result['validation']['valid'],result['validation'])
                self.assertNotIn(pan,json.dumps(result))
                row=result['sections'][0]['items'][1]
                self.assertEqual(row['reference'],'[tarjeta-'+pan[-4:]+']')
                self.assertIn('[tarjeta-'+pan[-4:]+']',row['description'])

    def test_grouped_pan_in_descriptions_is_redacted(self):
        for pan in ['4111 1111 1111 1111','5555-5555-5555-4444']:
            with self.subTest(separator=pan[4]):
                pages=international_pages()
                pages[0]=pages[0].replace('SERVICIO WEB','SERVICIO '+pan)
                result=self.parse(pages)
                self.assertNotIn(pan,json.dumps(result))
                self.assertIn('[tarjeta-',result['sections'][0]['items'][0]['description'])

    def test_pan_followed_by_short_numeric_reference_is_redacted(self):
        for pan in ['4111111111111111','4111 1111 1111 1111',
                    '4222-2222-2222-2','4000 0000 0000 0000 006']:
            with self.subTest(length=len(pan)):
                pages=national_pages()
                pages[0]=pages[0].replace('COMERCIO FICTICIO UNO','COMERCIO '+pan+' 12',1)
                result=self.parse(pages)
                self.assertTrue(result['validation']['valid'],result['validation'])
                row=result['sections'][0]['items'][1]
                self.assertNotIn(pan,row['description'])
                self.assertIn('] 12 CIUDAD',row['description'])

    def test_numeric_boundaries_preserve_bank_references_and_invalid_luhn(self):
        for reference in ['41111111111111','41111111111111110000000','4111111111111112']:
            with self.subTest(length=len(reference)):
                pages=national_pages()
                pages[0]=pages[0].replace('222222222221',reference).replace('COMERCIO FICTICIO UNO','COMERCIO '+reference,1)
                row=self.parse(pages)['sections'][0]['items'][1]
                self.assertEqual(row['reference'],reference)
                self.assertIn(reference,row['description'])

    def test_stable_row_keys_and_multiplicity(self):
        first=self.parse();second=self.parse()
        self.assertEqual(first,second)
        rows=[r for s in first['sections'] for r in s['items']]
        self.assertEqual(len(rows),len(set(r['rowKey']for r in rows)))

    def test_header_summary_without_purchase_rows_is_not_complete(self):
        pages=international_pages();pages[0]='\n'.join(line for line in pages[0].splitlines() if not line.startswith(('0805','0905')))
        result=self.parse(pages)
        self.assertFalse(result['validation']['valid'])
        self.assertIn('INTERNATIONAL_PURCHASES_TOTAL_MISMATCH',result['validation']['issues'])

class PdfWorker(unittest.TestCase):
    def invoke(self,buffer,password='fixture-only',filename='EECCTarjetaVisa.pdf'):
        result=subprocess.run([sys.executable,str(MODULE)],input=json.dumps({'pdfBase64':base64.b64encode(buffer).decode(),'password':password,'filename':filename}),text=True,capture_output=True,timeout=30)
        return result,json.loads(result.stdout)

    def test_native_encrypted_pdf_processed_without_ocr(self):
        result,dto=self.invoke(make_pdf(national_pages()+international_pages()))
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertTrue(dto['validation']['valid'],dto['validation'])
        self.assertEqual(dto['sections'][0]['totals']['billedTotal'],'730')
        self.assertNotIn('fixture-only',result.stdout+result.stderr)

    def test_wrong_password_only_safe_error(self):
        result,dto=self.invoke(make_pdf(national_pages()),password='incorrect-fixture')
        self.assertNotEqual(result.returncode,0)
        self.assertEqual(dto,{'error':{'code':'STATEMENT_PDF_PASSWORD_INVALID'}})
        self.assertNotIn('Traceback',result.stderr)
        self.assertNotIn('incorrect-fixture',result.stdout+result.stderr)

    def test_invalid_pdf_only_safe_error(self):
        result,dto=self.invoke(b'%PDF-invalid fixture')
        self.assertNotEqual(result.returncode,0)
        self.assertEqual(dto,{'error':{'code':'STATEMENT_PDF_INVALID'}})
        self.assertNotIn('Traceback',result.stderr)

    def test_image_only_or_empty_pdf_is_not_ocrd(self):
        result,dto=self.invoke(make_pdf(['']))
        self.assertNotEqual(result.returncode,0)
        self.assertEqual(dto,{'error':{'code':'STATEMENT_TEXT_UNAVAILABLE'}})

    def test_non_pdf_magic_rejected(self):
        result,dto=self.invoke(b'not a pdf')
        self.assertNotEqual(result.returncode,0)
        self.assertEqual(dto,{'error':{'code':'STATEMENT_PDF_INVALID'}})

if __name__=='__main__': unittest.main()
