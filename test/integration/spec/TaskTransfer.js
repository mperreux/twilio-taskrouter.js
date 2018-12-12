import EnvTwilio from '../../util/EnvTwilio';
import Worker from '../../../lib/Worker';
import * as assert from 'assert';

const chai = require('chai');
chai.use(require('sinon-chai'));
const expect = chai.expect;
chai.should();
const credentials = require('../../env');
const JWT = require('../../util/MakeAccessToken');

describe('Task Transfer', function() {
  /* eslint-disable no-invalid-this */
  this.timeout(5000);
  /* eslint-enable */

  const envTwilio = new EnvTwilio(credentials.accountSid, credentials.authToken, credentials.env);
  const aliceToken = JWT.getAccessToken(credentials.accountSid, credentials.multiTaskWorkspaceSid, credentials.multiTaskAliceSid);
  const bobToken = JWT.getAccessToken(credentials.accountSid, credentials.multiTaskWorkspaceSid, credentials.multiTaskBobSid);
  let alice;
  let bob;

    before(() => {
        return envTwilio.deleteAllTasks(credentials.multiTaskWorkspaceSid).then(() => {
            return envTwilio.updateWorkerActivity(
                credentials.multiTaskWorkspaceSid,
                credentials.multiTaskAliceSid,
                credentials.multiTaskUpdateActivitySid
            );
        }).then(() => {
            return envTwilio.updateWorkerActivity(
                credentials.multiTaskWorkspaceSid,
                credentials.multiTaskBobSid,
                credentials.multiTaskUpdateActivitySid
            );
        });
    });

    after(() => {
        alice.removeAllListeners();
        bob.removeAllListeners();
        return envTwilio.deleteAllTasks(credentials.multiTaskWorkspaceSid).then(() => {
            return envTwilio.updateWorkerActivity(
                credentials.multiTaskWorkspaceSid,
                credentials.multiTaskAliceSid,
                credentials.multiTaskUpdateActivitySid
            );
        }).then(() => {
            return envTwilio.updateWorkerActivity(
                credentials.multiTaskWorkspaceSid,
                credentials.multiTaskBobSid,
                credentials.multiTaskUpdateActivitySid
            );
        });
    });

    describe('#Failed Transfer to a worker', () => {

        it('should accept reservation, transfer the task and reject the transfer', done => {

            alice = new Worker(aliceToken, {
                connectActivitySid: credentials.multiTaskConnectActivitySid,
                ebServer: `${credentials.ebServer}/v1/wschannels`,
                wsServer: `${credentials.wsServer}/v1/wschannels`,
                logLevel: 'error',
            });

            // bob stays offline
            bob = new Worker(bobToken, {
                ebServer: `${credentials.ebServer}/v1/wschannels`,
                wsServer: `${credentials.wsServer}/v1/wschannels`,
                logLevel: 'error',
            });

            envTwilio.createTask(
                credentials.multiTaskWorkspaceSid,
                credentials.multiTaskWorkflowSid,
                JSON.stringify({
                    to: 'client:alice',
                    conference: { sid: 'CF11111111111111111111111111111111' }
                })
            );

            return alice.on('reservationCreated', reservation => {

                // Make Bob available
                return envTwilio.updateWorkerActivity(
                    credentials.multiTaskWorkspaceSid,
                    credentials.multiTaskBobSid,
                    credentials.multiTaskConnectActivitySid
                ).then(() => reservation.accept()
                ).then(acceptedReservation => {
                    // Transfer the task, verify that transfer was initiated and have Bob reject
                    return Promise.all([
                                acceptedReservation.task.transfer(credentials.multiTaskBobSid),
                                new Promise(resolve => {
                                    acceptedReservation.task.on('transferInitiated', () => resolve());
                                }),
                                new Promise(resolve => {
                                    bob.once('reservationCreated', transferReservation => {
                                        // Verify that transfer object is on the created reservation
                                        expect(transferReservation.transfer.mode).equals('WARM');
                                        expect(transferReservation.transfer.to).equals(bob.sid);
                                        expect(transferReservation.transfer.workerSid).equals(alice.sid);
                                        expect(transferReservation.transfer.type).equals('WORKER');
                                        expect(transferReservation.transfer.reservationSid.substring(0, 2)).equals('WR');
                                        expect(transferReservation.transfer.sid.substring(0, 2)).equals('TT');
                                        expect(transferReservation.transfer.status).equals('initiated');

                                        transferReservation.reject().then(() => {
                                            // verify that on rejecting the transfer reservation, the transfer object
                                            // is updated as well with the failed status
                                            transferReservation.once('rejected', rejectedReservation => {
                                                expect(rejectedReservation.transfer.mode).equals('WARM');
                                                expect(rejectedReservation.transfer.to).equals(bob.sid);
                                                expect(rejectedReservation.transfer.workerSid).equals(alice.sid);
                                                expect(rejectedReservation.transfer.type).equals('WORKER');
                                                expect(rejectedReservation.transfer.reservationSid.substring(0, 2)).equals('WR');
                                                expect(rejectedReservation.transfer.sid.substring(0, 2)).equals('TT');
                                                expect(rejectedReservation.transfer.status).equals('failed');
                                                resolve();
                                            });
                                        });
                                    });
                                }),
                                new Promise(resolve => {
                                    acceptedReservation.task.on('transferFailed', () => resolve());
                                }),

                    ]).then(() => done());
                });
            });

        }).timeout(15000);
    });
});

//TODO : Allow accepting transfer reservations using status update and add tests for successful transfers.

