import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ArcoVue from '@arco-design/web-vue'
import '@arco-design/web-vue/dist/arco.css'
import {
  IconAlipayCircle,
  IconArchive,
  IconAttachment,
  IconBarChart,
  IconBook,
  IconCamera,
  IconCheck,
  IconCheckCircle,
  IconCheckSquare,
  IconClose,
  IconCompass,
  IconCopy,
  IconDelete,
  IconDesktop,
  IconDown,
  IconDragDot,
  IconDriveFile,
  IconEdit,
  IconExclamationCircleFill,
  IconExpand,
  IconExperiment,
  IconFile,
  IconFolder,
  IconLeft,
  IconLink,
  IconList,
  IconLoading,
  IconLock,
  IconMenuFold,
  IconMenuUnfold,
  IconMessage,
  IconNotification,
  IconPlayCircle,
  IconPlus,
  IconRefresh,
  IconRight,
  IconSearch,
  IconSettings,
  IconShareAlt,
  IconTool,
  IconTrophy,
  IconUpload,
  IconUser,
} from '@arco-design/web-vue/es/icon'
import App from './App.vue'
import router from './router'
import i18n from './locales'
import { installArcoCompat } from './components/arco-compat'
import './styles/global.scss'
import './router/permission'

const app = createApp(App)

const appIcons = {
  Aim: IconCompass,
  ArrowDown: IconDown,
  ArrowLeft: IconLeft,
  Avatar: IconUser,
  Bell: IconNotification,
  BellFilled: IconNotification,
  Box: IconArchive,
  Camera: IconCamera,
  ChatDotSquare: IconMessage,
  Check: IconCheck,
  CircleCheck: IconCheckCircle,
  Close: IconClose,
  Coin: IconAlipayCircle,
  Collection: IconBook,
  Connection: IconLink,
  CopyDocument: IconCopy,
  DataLine: IconBarChart,
  Delete: IconDelete,
  Document: IconFile,
  DocumentChecked: IconCheckSquare,
  EditPen: IconEdit,
  Expand: IconExpand,
  Files: IconDriveFile,
  Finished: IconCheckCircle,
  Flag: IconCompass,
  Fold: IconMenuFold,
  Folder: IconFolder,
  FolderOpened: IconFolder,
  Link: IconLink,
  List: IconList,
  Loading: IconLoading,
  Lock: IconLock,
  Medal: IconTrophy,
  Monitor: IconDesktop,
  Notebook: IconBook,
  Operation: IconSettings,
  Paperclip: IconAttachment,
  Plus: IconPlus,
  Reading: IconBook,
  Refresh: IconRefresh,
  Right: IconRight,
  School: IconExperiment,
  Search: IconSearch,
  Setting: IconSettings,
  Share: IconShareAlt,
  Tickets: IconFile,
  Tools: IconTool,
  TrendCharts: IconBarChart,
  Upload: IconUpload,
  UploadFilled: IconUpload,
  User: IconUser,
  VideoPlay: IconPlayCircle,
  WarningFilled: IconExclamationCircleFill,
}

for (const [key, component] of Object.entries(appIcons)) {
  app.component(key, component)
}

// Pinia with persistence
const pinia = createPinia()

app.use(pinia)
app.use(ArcoVue)
installArcoCompat(app)
app.use(router)
app.use(i18n)

app.mount('#app')
