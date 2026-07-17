<script setup lang="ts">
import { computed } from 'vue'

import { PageContainer, PageToolbar } from '@/components/business'
import { usePermission } from '@/composables/usePermission'
import CurrencySettings from '@/views/currency/index.vue'
import ApprovalSettings from './approvals.vue'
import IntegrationSettings from './integrations.vue'
import AuditLogs from './logs.vue'
import NotificationSettings from './notification.vue'
import SystemSettings from './config.vue'

const { hasAnyPermission } = usePermission()
const canCurrency = computed(() => hasAnyPermission(['currency:view', 'currency:manage']))
const canNotifications = computed(() => hasAnyPermission(['notification_rule:view', 'notification_rule:manage']))
const canApprovals = computed(() => hasAnyPermission(['approval_config:view', 'approval_config:manage']))
const canLogs = computed(() => hasAnyPermission(['audit_log:view']))
const canSystem = computed(() => hasAnyPermission(['system_setting:view', 'system_setting:manage', 'field_setting:manage']))
const canIntegrations = computed(() => hasAnyPermission(['integration:view', 'integration:manage']))
</script>

<template>
  <PageContainer class="settings-center">
    <PageToolbar title="设置中心" description="在同一页面集中查看和维护平台设置，各区域按管理流程从上到下排列。" />
    <section v-if="canCurrency" id="currency" class="settings-area">
      <CurrencySettings />
    </section>
    <section v-if="canNotifications" id="notifications" class="settings-area">
      <NotificationSettings />
    </section>
    <section v-if="canApprovals" id="approvals" class="settings-area">
      <ApprovalSettings />
    </section>
    <section v-if="canLogs" id="logs" class="settings-area">
      <AuditLogs />
    </section>
    <section v-if="canSystem" id="system" class="settings-area">
      <SystemSettings />
    </section>
    <section v-if="canIntegrations" id="integrations" class="settings-area">
      <IntegrationSettings />
    </section>
  </PageContainer>
</template>

<style scoped lang="scss">
.settings-center { min-width: 0; }
.settings-area { min-width: 0; padding-top: 8px; border-top: 1px solid var(--color-border-2); scroll-margin-top: 72px; }
.settings-area :deep(.page-container) { padding: 0; }
.settings-area + .settings-area { margin-top: 20px; }
</style>
