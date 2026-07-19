export interface ProjectPayment {
  id: string
  projectId: string
  paymentName: string
  paymentType: string
  dueDate?: string | null
  receivedDate?: string | null
  status: string
  originalAmount: number
  originalCurrency: string
  exchangeRate: number
  convertedCurrency: string
  convertedAmount: number
  receivedOriginalAmount: number
  receivedConvertedAmount: number
  rateDate: string
  rateSource: string
  remark?: string
}

export interface ProjectPaymentPayload {
  projectId: string
  paymentName: string
  paymentType?: string
  dueDate?: string | null
  originalAmount: number
  originalCurrency: string
  convertedCurrency: string
  receivedOriginalAmount?: number
  receivedDate?: string | null
  remark?: string
}
