import EnvTwilio from '../../util/EnvTwilio';
import Supervisor from '../../../lib/Supervisor';
import Worker from '../../../lib/Worker';

const chai = require('chai');
chai.use(require('sinon-chai'));
chai.should();
const credentials = require('../../env');
const JWT = require('../../util/MakeAccessToken');

describe('Supervisor Client', function() {
  /* eslint-disable no-invalid-this */
  this.timeout(5000);
  /* eslint-enable */

  const envTwilio = new EnvTwilio(credentials.accountSid, credentials.authToken, credentials.env);
  const superToken = JWT.getAccessToken(credentials.accountSid, credentials.multiTaskWorkspaceSid, credentials.multiTaskAliceSid, null, 'supervisor');
  const workerToken = JWT.getAccessToken(credentials.accountSid, credentials.multiTaskWorkspaceSid, credentials.multiTaskBobSid);

  let reservation;
  let supervisor;
  let worker;
  before(() => {
    return envTwilio.deleteAllTasks(credentials.multiTaskWorkspaceSid).then(() => {
      worker = new Worker(workerToken, {
        ebServer: `${credentials.ebServer}/v1/wschannels`,
        wsServer: `${credentials.wsServer}/v1/wschannels`,
        logLevel: 'error',
      });

      supervisor = new Supervisor(superToken, {
        ebServer: `${credentials.ebServer}/v1/wschannels`,
        wsServer: `${credentials.wsServer}/v1/wschannels`,
        logLevel: 'error',
      });

      const createTask = envTwilio.updateWorkerCapacity(credentials.multiTaskWorkspaceSid, credentials.multiTaskAliceSid, 'default', 1)
        .then(() => envTwilio.updateWorkerCapacity(credentials.multiTaskWorkspaceSid, credentials.multiTaskBobSid, 'default', 1))
        .then(() => envTwilio.updateWorkerActivity(credentials.multiTaskWorkspaceSid, credentials.multiTaskBobSid, credentials.multiTaskConnectActivitySid))
        .then(() => envTwilio.createTask(credentials.multiTaskWorkspaceSid, credentials.multiTaskWorkflowSid, JSON.stringify({
          to: 'client:alice',
          conference: { sid: 'CF11111111111111111111111111111111' }
        })));

      return Promise.all([
        new Promise(resolve => supervisor.on('ready', () => resolve())),
        new Promise(resolve => worker.on('ready', () => resolve())),
        createTask,
      ]).then(() => {
          reservation = Array.from(worker.reservations.values())[0];
          return reservation.accept();
        });
      });
  });

  after(() => {
    supervisor.removeAllListeners();
    worker.removeAllListeners();
    return envTwilio.deleteAllTasks(credentials.multiTaskWorkspaceSid)
        .then(envTwilio.updateWorkerActivity(
            credentials.multiTaskWorkspaceSid,
            credentials.multiTaskAliceSid,
            credentials.multiTaskUpdateActivitySid
        )).then(envTwilio.updateWorkerActivity(
            credentials.multiTaskWorkspaceSid,
            credentials.multiTaskBobSid,
            credentials.multiTaskUpdateActivitySid
        ));
  });

  it('should get a 200 and resolve the Promise if all goes well', () => {
    return supervisor.monitor(reservation.task.sid, reservation.sid);
  });
});
