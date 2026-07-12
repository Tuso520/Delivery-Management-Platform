import type { Component } from 'vue'
import {
  IconAlipayCircle,
  IconBarChart,
  IconBook,
  IconCheckCircle,
  IconCopy,
  IconDesktop,
  IconDriveFile,
  IconFile,
  IconFolder,
  IconLink,
  IconNotification,
  IconSettings,
  IconTool,
} from '@arco-design/web-vue/es/icon'

const menuIcons: Readonly<Record<string, Component>> = {
  Bell: IconNotification,
  CircleCheck: IconCheckCircle,
  Coin: IconAlipayCircle,
  Collection: IconBook,
  CopyDocument: IconCopy,
  DataLine: IconBarChart,
  Files: IconDriveFile,
  Finished: IconCheckCircle,
  Folder: IconFolder,
  FolderOpened: IconFolder,
  Link: IconLink,
  Monitor: IconDesktop,
  Notebook: IconBook,
  Operation: IconSettings,
  Reading: IconBook,
  Setting: IconSettings,
  Tickets: IconFile,
  Tools: IconTool,
}

export function resolveMenuIcon(icon?: string): Component | undefined {
  return icon ? menuIcons[icon] : undefined
}
