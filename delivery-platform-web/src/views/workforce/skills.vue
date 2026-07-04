<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import dayjs from 'dayjs'
import { dictionaryApi, workforceApi } from '@/api/platform'
import { userApi } from '@/api/user'
import type { DictionaryItem, SkillDefinition } from '@/types/platform'
import type { UserListItem } from '@/types/user'

const loading = ref(false)
const records = ref<SkillDefinition[]>([])
const users = ref<UserListItem[]>([])
const categories = ref<DictionaryItem[]>([])
const levels = ref<DictionaryItem[]>([])
const dialogVisible = ref(false)
const assessmentVisible = ref(false)
const selectedSkill = ref<SkillDefinition>()
const activeView = ref<'library' | 'scores'>('library')
const activeCategory = ref('')
const keyword = ref('')
const skillForm = ref({ skillCode: '', skillName: '', category: '', maxLevel: 5, description: '' })
const assessmentForm = ref({
  userId: '',
  period: `${dayjs().year()}-Q${Math.ceil((dayjs().month() + 1) / 3)}`,
  level: 3,
  selfScore: 80,
  managerScore: 80,
  evidenceNote: '',
})
const quarterOptions = Array.from({ length: 8 }, (_, index) => {
  const quarterOffset = index - 3
  const currentQuarter = Math.ceil((dayjs().month() + 1) / 3)
  const absoluteQuarter = dayjs().year() * 4 + currentQuarter - 1 + quarterOffset
  const year = Math.floor(absoluteQuarter / 4)
  const quarter = (absoluteQuarter % 4) + 1
  return `${year}-Q${quarter}`
})

async function fetchData(): Promise<void> {
  loading.value = true
  try {
    const [skillPage, userPage, categoryDictionary, levelDictionary] = await Promise.all([
      workforceApi.getSkills({ page: 1, pageSize: 100 }),
      userApi.getList({ page: 1, pageSize: 100, status: 'Active' }),
      dictionaryApi.getByCode('skill_category'),
      dictionaryApi.getByCode('skill_level'),
    ])
    records.value = skillPage.list
    users.value = userPage.list
    categories.value = categoryDictionary.items
    levels.value = levelDictionary.items
  } finally {
    loading.value = false
  }
}

async function saveSkill(): Promise<void> {
  await workforceApi.saveSkill(skillForm.value)
  Message.success('技能项已保存')
  dialogVisible.value = false
  await fetchData()
}

function openAssessment(skill: SkillDefinition): void {
  selectedSkill.value = skill
  assessmentForm.value = {
    userId: '',
    period: quarterOptions[3],
    level: 3,
    selfScore: 80,
    managerScore: 80,
    evidenceNote: '',
  }
  assessmentVisible.value = true
}

const filteredSkills = computed(() =>
  records.value.filter((skill) => {
    const matchesCategory = !activeCategory.value || skill.category === activeCategory.value
    const matchesKeyword = !keyword.value ||
      skill.skillName.includes(keyword.value) ||
      skill.skillCode.toLowerCase().includes(keyword.value.toLowerCase())
    return matchesCategory && matchesKeyword
  }),
)

const scoreRows = computed(() =>
  filteredSkills.value.flatMap((skill) =>
    skill.assessments.map((assessment) => ({
      ...assessment,
      skillName: skill.skillName,
      category: skill.category,
    })),
  ),
)

async function saveAssessment(): Promise<void> {
  if (!selectedSkill.value) return
  await workforceApi.assessSkill({ skillId: selectedSkill.value.id, ...assessmentForm.value })
  Message.success('技能评估已记录')
  assessmentVisible.value = false
  await fetchData()
}

onMounted(fetchData)
</script>

<template>
  <section class="resource-page">
    <div class="skills-toolbar">
      <a-segmented
        v-model="activeView"
        :options="[
          { label: '技能库', value: 'library' },
          { label: '人员技能成绩', value: 'scores' },
        ]"
      />
      <a-button type="primary" @click="dialogVisible = true">
        新增技能      </a-button>
    </div>
    <div class="filter-bar">
      <a-select v-model="activeCategory" clearable placeholder="全部技能分类">
        <a-option
          v-for="item in categories"
          :key="item.id"
          :label="item.itemLabel"
          :value="item.itemValue"
        />
      </a-select>
      <a-input v-model="keyword" clearable placeholder="搜索技能名称或编码" />
    </div>
    <a-table
      v-if="activeView === 'library'"
      v-loading="loading"
      :data="filteredSkills"
      border
      stripe
    >
      <a-table-column prop="category" label="分类" :width="120" />
      <a-table-column prop="skillCode" label="编码" :width="150" />
      <a-table-column prop="skillName" label="技能名称" :min-width="220" />
      <a-table-column
        prop="description"
        label="能力说明"
        :min-width="240"
        show-overflow-tooltip
      />
      <a-table-column label="最新评估" :min-width="320">
        <template #default="{ row }">
          <a-space wrap>
            <a-tag v-for="item in row.assessments.slice(0, 4)" :key="item.id">
              {{ item.user.realName }} L{{ item.level }} / {{ item.finalScore ?? '-' }}分 · {{ item.period }}
            </a-tag>
          </a-space>
        </template>
      </a-table-column>
      <a-table-column label="操作" :width="100">
        <template #default="{ row }">
          <a-button text type="primary" @click="openAssessment(row)">
            评估
          </a-button>
        </template>
      </a-table-column>
    </a-table>
    <a-table
      v-else
      v-loading="loading"
      :data="scoreRows"
      border
      stripe
    >
      <a-table-column prop="user.realName" label="人员" :min-width="120" />
      <a-table-column prop="category" label="分类" :width="120" />
      <a-table-column prop="skillName" label="技能名称" :min-width="220" />
      <a-table-column prop="period" label="评估周期" :width="120" />
      <a-table-column
        prop="selfScore"
        label="自评"
        :width="90"
        align="right"
      />
      <a-table-column
        prop="managerScore"
        label="上级评分"
        :width="110"
        align="right"
      />
      <a-table-column
        prop="finalScore"
        label="最终成绩"
        :width="110"
        align="right"
      />
      <a-table-column prop="level" label="技能等级" :width="100">
        <template #default="{ row }">
          L{{ row.level }}
        </template>
      </a-table-column>
      <a-table-column prop="assessor.realName" label="评估人" :min-width="120" />
      <a-table-column
        prop="evidenceNote"
        label="评估依据"
        :min-width="260"
        show-overflow-tooltip
      />
    </a-table>

    <a-dialog v-model="dialogVisible" title="新增技能" width="540px">
      <a-form :model="skillForm" label-width="90px">
        <a-form-item label="技能编码">
          <a-input v-model="skillForm.skillCode" />
        </a-form-item>
        <a-form-item label="技能名称">
          <a-input v-model="skillForm.skillName" />
        </a-form-item>
        <a-form-item label="分类">
          <a-select v-model="skillForm.category">
            <a-option
              v-for="item in categories"
              :key="item.id"
              :label="item.itemLabel"
              :value="item.itemValue"
            />
          </a-select>
        </a-form-item>
        <a-form-item label="最高等级">
          <a-input-number v-model="skillForm.maxLevel" :min="1" :max="10" />
        </a-form-item>
        <a-form-item label="说明">
          <a-textarea v-model="skillForm.description" />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button type="primary" @click="saveSkill">
          保存
        </a-button>
      </template>
    </a-dialog>

    <a-dialog v-model="assessmentVisible" :title="`技能评估· ${selectedSkill?.skillName || ''}`" width="540px">
      <a-form :model="assessmentForm" label-width="90px">
        <a-form-item label="人员">
          <a-select v-model="assessmentForm.userId" filterable style="width:100%">
            <a-option
              v-for="user in users"
              :key="user.id"
              :label="user.realName"
              :value="user.id"
            />
          </a-select>
        </a-form-item>
        <a-form-item label="季度">
          <a-select v-model="assessmentForm.period">
            <a-option
              v-for="item in quarterOptions"
              :key="item"
              :label="item"
              :value="item"
            />
          </a-select>
        </a-form-item>
        <a-form-item label="等级">
          <a-radio-group v-model="assessmentForm.level">
            <a-radio-button
              v-for="item in levels.filter(level => Number(level.itemValue) <= (selectedSkill?.maxLevel || 5))"
              :key="item.id"
              :value="Number(item.itemValue)"
            >
              {{ item.itemLabel }}
            </a-radio-button>
          </a-radio-group>
        </a-form-item>
        <a-form-item label="人员自评">
          <a-slider
            v-model="assessmentForm.selfScore"
            :min="0"
            :max="100"
            show-input
          />
        </a-form-item>
        <a-form-item label="上级评分">
          <a-slider
            v-model="assessmentForm.managerScore"
            :min="0"
            :max="100"
            show-input
          />
        </a-form-item>
        <a-form-item label="最终成绩">
          <strong>{{ assessmentForm.managerScore ?? assessmentForm.selfScore }}</strong>
        </a-form-item>
        <a-form-item label="评估依据">
          <a-textarea v-model="assessmentForm.evidenceNote" />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button type="primary" @click="saveAssessment">
          提交评估
        </a-button>
      </template>
    </a-dialog>
  </section>
</template>

<style scoped lang="scss">
.skills-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.filter-bar {
  display: grid;
  grid-template-columns: 220px minmax(240px, 420px);
}
</style>
