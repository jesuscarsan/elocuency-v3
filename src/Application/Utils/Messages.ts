import { Notice } from 'obsidian';

export function showMessage(message: string) {
  console.log(message);
  new Notice(message, 3000);
}
