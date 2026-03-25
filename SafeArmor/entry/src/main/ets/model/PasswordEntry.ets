export interface PasswordEntry extends Sendable {
  id: string;
  title: string;
  username: string;
  encryptedPassword: string;
  category: string;
  strengthScore: number;
  createTime: number;
  updateTime: number;
  remark: string;
}

export enum PasswordCategory {
  SOCIAL = '社交应用',
  FINANCIAL = '金融支付',
  WORK = '办公工作',
  GAME = '游戏娱乐',
  OTHER = '其他分类'
}