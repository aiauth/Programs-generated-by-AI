import cryptoFramework from '@ohos.security.cryptoFramework';
import util from '@ohos.util';

export class CryptoManager {
  private static instance: CryptoManager;
  private readonly KEY_SIZE = 256;
  private readonly IV_SIZE = 12;
  private readonly TAG_SIZE = 16;

  private constructor() {}

  public static getInstance(): CryptoManager {
    if (!this.instance) this.instance = new CryptoManager();
    return this.instance;
  }

  public async generateAesKey() {
    const gen = cryptoFramework.createKeyGenerator('AES256');
    return await gen.generateSecretKey();
  }

  public async encrypt(plain: string, key): Promise<string> {
    const iv = new Uint8Array(this.IV_SIZE);
    cryptoFramework.getRandomBytes(iv);
    const param = { iv, tagLength: this.TAG_SIZE * 8 };
    const cipher = cryptoFramework.createCipher('AES256|GCM');
    await cipher.init(cryptoFramework.CipherMode.ENCRYPT_MODE, key, param);
    const data = new util.TextEncoder().encode(plain);
    const res = await cipher.doFinal(data);
    const all = new Uint8Array(iv.length + res.data.length + res.tag.length);
    all.set(iv, 0);
    all.set(res.data, iv.length);
    all.set(res.tag, iv.length + res.data.length);
    return new util.Base64().encodeToString(all);
  }

  public async decrypt(encStr: string, key): Promise<string> {
    const all = new util.Base64().decodeSync(encStr);
    const iv = all.slice(0, this.IV_SIZE);
    const tag = all.slice(-this.TAG_SIZE);
    const data = all.slice(this.IV_SIZE, -this.TAG_SIZE);
    const param = { iv, tagLength: this.TAG_SIZE * 8, tag };
    const cipher = cryptoFramework.createCipher('AES256|GCM');
    await cipher.init(cryptoFramework.CipherMode.DECRYPT_MODE, key, param);
    const dec = await cipher.doFinal(data);
    return new util.TextDecoder().decode(dec);
  }
}