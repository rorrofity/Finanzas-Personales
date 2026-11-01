const { createFintocDailyScheduler } = require('../fintocDailyScheduler');

const enabled = () => ({ FINTOC_ENABLED: 'true', FINTOC_PERSONAL_FREE_ACCESS_CONFIRMED: 'true', FINTOC_DAILY_SYNC_ENABLED: 'true' });
function setup(env = enabled()) {
  const task = { stop: jest.fn(), destroy: jest.fn() };
  const cron = { schedule: jest.fn(() => task) };
  const run = jest.fn().mockResolvedValue({ status: 'success', inserted: 0 });
  const service = jest.fn(() => ({ run }));
  const logger = { info: jest.fn(), warn: jest.fn() };
  const scheduler = createFintocDailyScheduler({ env, cron, service, logger });
  return { scheduler, cron, task, run, service, env, logger };
}

test.each(['FINTOC_ENABLED', 'FINTOC_PERSONAL_FREE_ACCESS_CONFIRMED', 'FINTOC_DAILY_SYNC_ENABLED'])('does not register a job without %s and never initializes the engine', (flag) => {
  const test = setup({ ...enabled(), [flag]: 'false' });
  expect(test.scheduler.start()).toMatchObject({ scheduled: false });
  expect(test.cron.schedule).not.toHaveBeenCalled();
  expect(test.service).not.toHaveBeenCalled();
});

test('registers exactly one 07:00 Santiago job without running a startup import', () => {
  const test = setup();
  expect(test.scheduler.start()).toEqual({ scheduled: true, schedule: '07:00', timezone: 'America/Santiago' });
  expect(test.cron.schedule).toHaveBeenCalledWith('0 7 * * *', expect.any(Function), { timezone: 'America/Santiago' });
  test.scheduler.start();
  expect(test.cron.schedule).toHaveBeenCalledTimes(1);
  expect(test.service).not.toHaveBeenCalled();
  expect(test.run).not.toHaveBeenCalled();
});

test('the callback runs only the independent daily service with scheduled trigger', async () => {
  const test = setup();
  test.scheduler.start();
  await test.cron.schedule.mock.calls[0][1]();
  expect(test.run).toHaveBeenCalledWith({ trigger: 'scheduled' });
  expect(test.run).toHaveBeenCalledTimes(1);
});

test.each(['FINTOC_ENABLED', 'FINTOC_PERSONAL_FREE_ACCESS_CONFIRMED', 'FINTOC_DAILY_SYNC_ENABLED'])('rechecks %s before each scheduled execution', async (flag) => {
  const test = setup();
  test.scheduler.start();
  test.env[flag] = 'false';
  await test.cron.schedule.mock.calls[0][1]();
  expect(test.service).not.toHaveBeenCalled();
});

test('does not overlap a pending execution or retry after failure', async () => {
  const test = setup();
  let reject;
  test.run.mockImplementationOnce(() => new Promise((_, no) => { reject = no; }));
  test.scheduler.start();
  const callback = test.cron.schedule.mock.calls[0][1];
  const first = callback();
  await callback();
  expect(test.run).toHaveBeenCalledTimes(1);
  reject({ code: 'FINTOC_PAYMENT_REQUIRED', message: 'raw secret sk_live_privateExample' });
  await first;
  expect(test.run).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(test.logger.warn.mock.calls)).not.toMatch(/privateExample|raw secret/);
  expect(test.logger.warn).toHaveBeenCalledWith('[fintoc-daily] execution failed', 'FINTOC_PAYMENT_REQUIRED');
});

test('stop releases the cron job and permits a later explicit registration', () => {
  const test = setup();
  test.scheduler.start();
  test.scheduler.stop();
  expect(test.task.stop).toHaveBeenCalledTimes(1);
  expect(test.task.destroy).toHaveBeenCalledTimes(1);
  test.scheduler.start();
  expect(test.cron.schedule).toHaveBeenCalledTimes(2);
  expect(test.run).not.toHaveBeenCalled();
});
