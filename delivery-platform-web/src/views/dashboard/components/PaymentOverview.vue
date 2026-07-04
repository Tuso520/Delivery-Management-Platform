<script setup lang="ts">
const props = defineProps<{
  contractAmount: number
  plannedAmount: number
  receivedAmount: number
  outstandingAmount: number
  overdueAmount: number
  overdueCount: number
  completionRate: number
}>()

const formatter = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 0,
})
const amount = (value: number) => `¥${formatter.format(value)}`
</script>

<template>
  <section class="payment-panel">
    <header class="payment-header">
      <div>
        <h3>项目回款概览</h3>
        <p>按项目回款里程碑统计，金额统一折算为基准币种</p>
      </div>
      <div class="rate">
        <strong>{{ props.completionRate }}%</strong>
        <span>回款完成率</span>
      </div>
    </header>
    <div class="payment-body">
      <div class="payment-metrics">
        <div><span>合同总额</span><strong>{{ amount(contractAmount) }}</strong></div>
        <div><span>计划回款</span><strong>{{ amount(plannedAmount) }}</strong></div>
        <div class="received">
          <span>已回款</span><strong>{{ amount(receivedAmount) }}</strong>
        </div>
        <div><span>待回款</span><strong>{{ amount(outstandingAmount) }}</strong></div>
        <div class="overdue">
          <span>逾期回款（{{ overdueCount }}笔）</span><strong>{{ amount(overdueAmount) }}</strong>
        </div>
      </div>
      <a-progress
        :percentage="Math.min(completionRate, 100)"
        :stroke-width="12"
        :color="completionRate >= 80 ? '#3f8064' : completionRate >= 50 ? '#b17831' : '#b64f5c'"
      />
    </div>
  </section>
</template>

<style scoped lang="scss">
.payment-panel { margin-bottom:18px; border:1px solid #e5e6eb; background:#fff; }
.payment-header { display:flex; justify-content:space-between; align-items:center; gap:20px; padding:17px 20px; border-bottom:1px solid #f2f3f5;
  h3 { margin:0; color:#1d2129; font-size:16px; }
  p { margin:4px 0 0; color:#86909c; font-size:12px; }
}
.rate { text-align:right; strong { display:block; color:#165dff; font-size:24px; } span { color:#86909c; font-size:12px; } }
.payment-body { padding:20px; }
.payment-metrics { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:0; margin-bottom:20px;
  div { min-width:0; padding:0 18px; border-right:1px solid #f2f3f5; }
  div:first-child { padding-left:0; }
  div:last-child { border-right:0; }
  span { display:block; margin-bottom:8px; color:#75807a; font-size:12px; }
  strong { color:#1d2129; font-size:18px; font-variant-numeric:tabular-nums; }
  .received strong { color:#00b42a; }
  .overdue strong { color:#f53f3f; }
}
@media (max-width:980px) {
  .payment-metrics { grid-template-columns:repeat(2,minmax(0,1fr)); gap:18px; }
  .payment-metrics div { padding:0; border-right:0; }
}
</style>
