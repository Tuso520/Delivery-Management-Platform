export interface ProjectPayment {
  id: string
  projectId: string
  paymentName: string
  paymentType: string
  dueDate?: string | null
  receivedDate?: string | null
  status: string
  originalAmount: string
  originalCurrency: string
  exchangeRate: string
  convertedCurrency: string
  convertedAmount: string
  receivedOriginalAmount: string
  receivedConvertedAmount: string
  rateDate: string
  rateSource: string
  remark?: string
}

export interface ProjectPaymentPayload {
  projectId: string
  paymentName: string
  paymentType?: string
  dueDate?: string | null
  originalAmount: string
  originalCurrency: string
  convertedCurrency: string
  receivedOriginalAmount?: string
  receivedDate?: string | null
  remark?: string
}

export interface ProjectPaymentPlanItem {
  id?: string
  paymentName: string
  dueDate: string
  completed: boolean
  receivedDate?: string | null
  originalAmount: string
  receivedOriginalAmount?: string
  receivedConvertedAmount?: string
  remark: string
}

export interface ProjectPaymentPlanWriteItem {
  id?: string
  paymentName: string
  paymentType: string
  dueDate?: string | null
  originalAmount: string
  originalCurrency: string
  convertedCurrency: string
  receivedOriginalAmount: string
  receivedDate?: string | null
  remark?: string
}
