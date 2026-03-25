import AbilityConstant from '@ohos.app.ability.AbilityConstant';
import UIAbility from '@ohos.app.ability.UIAbility';
import Want from '@ohos.app.ability.Want';
import window from '@ohos.window';
import clipboard from '@ohos.clipboard';
import { DatabaseUtil } from '../utils/storage/DatabaseUtil';

export let isAppAuthenticated = false;

export default class EntryAbility extends UIAbility {
  async onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): Promise<void> {
    await DatabaseUtil.getInstance().initDatabase(this.context);
    console.info('SafeArmor：数据库初始化完成');
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent('pages/index');
  }

  onBackground(): void {
    clipboard.clear();
    isAppAuthenticated = false;
    console.info('SafeArmor：已后台，清空剪贴板+锁定');
  }
}