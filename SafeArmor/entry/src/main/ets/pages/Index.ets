import { NavPathStack } from '@kit.ArkUI';

@Entry
@Component
struct Index {
  private nav = new NavPathStack();

  build() {
    Navigation(this.nav) {
      NavDestination()
        .onReady(() => {
          this.nav.pushPath({ name: 'PasswordListPage' });
        });
    }
    .mode(NavigationMode.Auto)
    .width('100%')
    .height('100%');
  }
}