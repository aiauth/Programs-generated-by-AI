import userAuth from '@ohos.userIAM.userAuth';
import { BusinessError } from '@ohos.base';

export class AuthManager {
  private static instance: AuthManager;
  private readonly AUTH_TYPE = userAuth.UserAuthType.FINGERPRINT | userAuth.UserAuthType.FACE;
  private readonly CHALLENGE = new Uint8Array([1,2,3,4,5]);

  private constructor() {}

  public static getInstance(): AuthManager {
    if (!this.instance) this.instance = new AuthManager();
    return this.instance;
  }

  public async authenticate(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const ins = userAuth.createUserAuthInstance(userAuth.AuthTrustLevel.SECURE_DEVICE);
        ins.start(this.CHALLENGE, this.AUTH_TYPE, (res) => {
          resolve(res.result === userAuth.UserAuthResultCode.SUCCESS);
          ins.stop();
          ins.destroy();
        });
      } catch (e) {
        resolve(false);
      }
    });
  }
}