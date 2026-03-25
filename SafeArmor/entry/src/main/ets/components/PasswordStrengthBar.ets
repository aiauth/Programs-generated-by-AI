@Component
export struct PasswordStrengthBar {
  @Prop score: number;

  getColor() {
    if (this.score <= 1) return '#ff4757';
    if (this.score <= 3) return '#ffa502';
    return '#2ed573';
  }

  build() {
    Row() {
      Text('强度').fontSize(14).width(20);
      Progress({ value: this.score * 20, total: 100, type: ProgressType.Linear })
        .height(6).width('80%').color(this.getColor());
    }
    .width('90%');
  }
}