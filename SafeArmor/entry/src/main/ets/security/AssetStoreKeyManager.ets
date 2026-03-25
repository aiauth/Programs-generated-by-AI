import assetStore from '@ohos.security.assetStore';

export class AssetStoreKeyManager {
  private static instance: AssetStoreKeyManager;
  private readonly ALIAS = 'safe_armor_key';

  private constructor() {}
  public static getInstance(): AssetStoreKeyManager {
    if (!this.instance) this.instance = new AssetStoreKeyManager();
    return this.instance;
  }

  async saveKey(value: string) {
    await assetStore.set(this.ALIAS, value, { syncable: false, durable: true });
  }

  async getKey(): Promise<string | null> {
    try {
      return await assetStore.get(this.ALIAS);
    } catch {
      return null;
    }
  }
}