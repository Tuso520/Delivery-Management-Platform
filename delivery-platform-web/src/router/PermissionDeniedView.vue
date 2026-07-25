<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { PermissionDeniedState } from '@/platform/permission'

const { t } = useI18n()
</script>

<template>
  <PermissionDeniedState :title="t('shell.noAccessibleMenu')" />
</template>
