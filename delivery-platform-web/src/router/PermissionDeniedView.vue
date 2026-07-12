<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import PermissionDeniedState from '@/components/business/PermissionDeniedState.vue'

const { t } = useI18n()
</script>

<template>
  <PermissionDeniedState :title="t('shell.noAccessibleMenu')" />
</template>
