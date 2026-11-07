import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen,
  CalendarRange,
  History,
  Lock,
  Plus,
  Save,
  ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useMerchantIdentity } from '@/hooks/useMerchantRealtime'
import {
  accountingQueryKeys,
  closeAccountingPeriod,
  createFiscalYear,
  fetchAccountingAuditLog,
  fetchAccountingSettings,
  fetchPeriods,
  fiscalYearDates,
  initializeAccounting,
  saveAccountingSettings,
} from './accounting-data'

export function SettingsView() {
  const merchantId = useMerchantIdentity()
  const queryClient = useQueryClient()

  // Tab within settings
  const [activeSubTab, setActiveSubTab] = useState<'policy' | 'periods' | 'audit'>('policy')

  // Queries
  const { data: settings } = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'settings'],
    queryFn: fetchAccountingSettings,
    enabled: Boolean(merchantId),
  })

  const { data: periods = [], isLoading: isLoadingPeriods } = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'periods'],
    queryFn: fetchPeriods,
    enabled: Boolean(merchantId),
  })

  const { data: auditLogs = [], isLoading: isLoadingAudit } = useQuery({
    queryKey: [...accountingQueryKeys(merchantId || ''), 'audit'],
    queryFn: fetchAccountingAuditLog,
    enabled: Boolean(merchantId),
  })

  // Settings form states
  const [countryCode, setCountryCode] = useState(() => settings?.country_code || 'YE')
  const [functionalCurrency, setFunctionalCurrency] = useState(() => settings?.functional_currency || 'YER')
  const [timezone, setTimezone] = useState(() => settings?.timezone || 'Asia/Aden')
  const [startDate, setStartDate] = useState(() => settings?.accounting_start_date || '2026-01-01')
  const [taxEnabled, setTaxEnabled] = useState(() => Boolean(settings?.tax_enabled))
  const [policyConfirmed, setPolicyConfirmed] = useState(() => Boolean(settings?.policy_confirmed))

  // Update local states when query finishes
  const [hasLoadedSettings, setHasLoadedSettings] = useState(false)
  if (settings && !hasLoadedSettings) {
    setCountryCode(settings.country_code || 'YE')
    setFunctionalCurrency(settings.functional_currency || 'YER')
    setTimezone(settings.timezone || 'Asia/Aden')
    setStartDate(settings.accounting_start_date || '2026-01-01')
    setTaxEnabled(Boolean(settings.tax_enabled))
    setPolicyConfirmed(Boolean(settings.policy_confirmed))
    setHasLoadedSettings(true)
  }

  // Periods modal & form
  const [isAddYearOpen, setIsAddYearOpen] = useState(false)
  const [yearName, setYearName] = useState('')
  const [startMonth, setStartMonth] = useState(() => `${new Date().getFullYear()}-01`)

  // Mutations
  const saveSettingsMutation = useMutation({
    mutationFn: saveAccountingSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountingQueryKeys(merchantId || '') })
      toast.success('تم حفظ إعدادات وسياسة النظام المحاسبي بنجاح.')
    },
    onError: (err: any) => {
      toast.error(err.message || 'فشل حفظ الإعدادات.')
    },
  })

  const initMutation = useMutation({
    mutationFn: initializeAccounting,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountingQueryKeys(merchantId || '') })
      toast.success('تمت تهيئة دليل الحسابات القياسي للمنشأة بنجاح.')
    },
    onError: (err: any) => {
      toast.error(err.message || 'فشل تهيئة الدليل.')
    },
  })

  const createYearMutation = useMutation({
    mutationFn: createFiscalYear,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountingQueryKeys(merchantId || '') })
      toast.success('تم إنشاء السنة المالية وفتراتها الشهرية بنجاح.')
      setIsAddYearOpen(false)
      setYearName('')
    },
    onError: (err: any) => {
      toast.error(err.message || 'فشل إنشاء السنة المالية.')
    },
  })

  const closePeriodMutation = useMutation({
    mutationFn: closeAccountingPeriod,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountingQueryKeys(merchantId || '') })
      toast.success('تم إقفال الفترة المالية بنجاح ومنع الترحيل فيها.')
    },
    onError: (err: any) => {
      toast.error(err.message || 'فشل إقفال الفترة.')
    },
  })

  function handleSaveSettings(e: FormEvent) {
    e.preventDefault()
    saveSettingsMutation.mutate({
      country_code: countryCode.trim().toUpperCase() || null,
      functional_currency: functionalCurrency.trim().toUpperCase() || null,
      timezone: timezone.trim() || null,
      accounting_start_date: startDate || null,
      policy_confirmed: policyConfirmed,
      tax_enabled: taxEnabled,
    })
  }

  function handleCreateYear(e: FormEvent) {
    e.preventDefault()
    if (!yearName.trim()) {
      toast.error('يرجى إدخال مسمى السنة المالية.')
      return
    }
    const dates = fiscalYearDates(startMonth)
    createYearMutation.mutate({
      name: yearName.trim(),
      start_date: dates.start_date,
      end_date: dates.end_date,
    })
  }

  return (
    <div className='space-y-6'>
      {/* رأس الصفحة */}
      <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>إعدادات النظام والفترات المالية</h2>
          <p className='text-muted-foreground text-sm'>
            تكوين العملة الوظيفية، السنوات والفترات المحاسبية، وإقفال الحسابات السنوية مع سجل التدقيق
          </p>
        </div>
      </div>

      {/* تبويبات الإعدادات */}
      <div className='flex gap-2 border-b pb-3'>
        <Button
          variant={activeSubTab === 'policy' ? 'default' : 'outline'}
          size='sm'
          onClick={() => setActiveSubTab('policy')}
          className='gap-1.5'
        >
          <ShieldCheck className='size-4' />
          <span>السياسة المحاسبية والعملة</span>
        </Button>

        <Button
          variant={activeSubTab === 'periods' ? 'default' : 'outline'}
          size='sm'
          onClick={() => setActiveSubTab('periods')}
          className='gap-1.5'
        >
          <CalendarRange className='size-4' />
          <span>السنوات والفترات المالية</span>
        </Button>

        <Button
          variant={activeSubTab === 'audit' ? 'default' : 'outline'}
          size='sm'
          onClick={() => setActiveSubTab('audit')}
          className='gap-1.5'
        >
          <History className='size-4' />
          <span>سجل التدقيق المحاسبي (Audit Log)</span>
        </Button>
      </div>

      {/* 1. تبويب السياسة المحاسبية */}
      {activeSubTab === 'policy' && (
        <div className='grid gap-6 md:grid-cols-3'>
          <Card className='md:col-span-2'>
            <CardHeader>
              <CardTitle className='text-base'>بيانات السياسة والعملة الوظيفية</CardTitle>
              <CardDescription>
                تحدد هذه البيانات أساس القيود المحاسبية، والعملة التي يتم بها تسجيل وترحيل الدفتر العام
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveSettings} className='space-y-4'>
                <div className='grid grid-cols-2 gap-4'>
                  <div className='space-y-2'>
                    <Label htmlFor='set-curr'>العملة الوظيفية الأساسية (3 أحرف)</Label>
                    <Input
                      id='set-curr'
                      placeholder='مثال: YER, SAR, USD'
                      value={functionalCurrency}
                      onChange={(e) => setFunctionalCurrency(e.target.value.toUpperCase())}
                      maxLength={3}
                      required
                    />
                  </div>

                  <div className='space-y-2'>
                    <Label htmlFor='set-country'>رمز الدولة (حرفان)</Label>
                    <Input
                      id='set-country'
                      placeholder='مثال: YE, SA, AE'
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                      maxLength={2}
                      required
                    />
                  </div>
                </div>

                <div className='grid grid-cols-2 gap-4'>
                  <div className='space-y-2'>
                    <Label htmlFor='set-start'>تاريخ بداية المحاسبة</Label>
                    <Input
                      id='set-start'
                      type='date'
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
                    />
                  </div>

                  <div className='space-y-2'>
                    <Label htmlFor='set-tz'>المنطقة الزمنية</Label>
                    <Input
                      id='set-tz'
                      placeholder='Asia/Aden'
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                    />
                  </div>
                </div>

                <div className='space-y-3 pt-2 border-t'>
                  <div className='flex items-center gap-2'>
                    <input
                      type='checkbox'
                      id='set-tax'
                      checked={taxEnabled}
                      onChange={(e) => setTaxEnabled(e.target.checked)}
                      className='size-4 rounded accent-primary'
                    />
                    <Label htmlFor='set-tax' className='cursor-pointer text-xs font-semibold'>
                      تفعيل نظام ضريبة القيمة المضافة ومحاسبة الضرائب
                    </Label>
                  </div>

                  <div className='flex items-center gap-2'>
                    <input
                      type='checkbox'
                      id='set-confirm'
                      checked={policyConfirmed}
                      onChange={(e) => setPolicyConfirmed(e.target.checked)}
                      className='size-4 rounded accent-primary'
                    />
                    <Label htmlFor='set-confirm' className='cursor-pointer text-xs font-semibold'>
                      أؤكد اعتماد السياسة المحاسبية والعملة الوظيفية لنشاط المنشأة
                    </Label>
                  </div>
                </div>

                <div className='pt-2'>
                  <Button type='submit' disabled={saveSettingsMutation.isPending} className='gap-2'>
                    <Save className='size-4' />
                    <span>حفظ إعدادات السياسة</span>
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* لوحة دليل الحسابات القياسي */}
          <div className='space-y-4'>
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>تهيئة دليل الحسابات</CardTitle>
                <CardDescription>
                  تهيئة الشجرة القياسية المعتمدة (الأصول، الخصوم، حقوق الملكية، الإيرادات، التكاليف، المصروفات).
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-4'>
                <p className='text-xs text-muted-foreground leading-relaxed'>
                  هذا الإجراء آمن تماماً، ولا يحذف أي قيود أو حسابات مخصصة سابقة، بل يقوم بتأسيس الحسابات النظامية التأسيسية.
                </p>
                <Button
                  variant='outline'
                  className='w-full gap-2'
                  onClick={() => initMutation.mutate()}
                  disabled={initMutation.isPending}
                >
                  <BookOpen className='size-4' />
                  <span>تهيئة الدليل القياسي (1000 - 6500)</span>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className='text-sm'>حالة النظام</CardTitle>
              </CardHeader>
              <CardContent className='space-y-2 text-xs'>
                <div className='flex justify-between py-1 border-b'>
                  <span className='text-muted-foreground'>العملة الوظيفية:</span>
                  <span className='font-bold'>{functionalCurrency}</span>
                </div>
                <div className='flex justify-between py-1 border-b'>
                  <span className='text-muted-foreground'>اعتماد السياسة:</span>
                  <Badge variant={policyConfirmed ? 'default' : 'secondary'} className={policyConfirmed ? 'bg-emerald-600' : ''}>
                    {policyConfirmed ? 'معتمد' : 'غير معتمد'}
                  </Badge>
                </div>
                <div className='flex justify-between py-1'>
                  <span className='text-muted-foreground'>نظام الضرائب:</span>
                  <span>{taxEnabled ? 'مفعل' : 'معطل'}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* 2. تبويب السنوات والفترات المالية */}
      {activeSubTab === 'periods' && (
        <div className='space-y-4'>
          <div className='flex items-center justify-between'>
            <div>
              <h3 className='font-semibold text-lg'>الفترات المحاسبية الشهرية</h3>
              <p className='text-xs text-muted-foreground'>
                تحدد الفترات المفتوحة التي يُسمح بترحيل القيود خلالها
              </p>
            </div>
            <Button size='sm' className='gap-1.5' onClick={() => setIsAddYearOpen(true)}>
              <Plus className='size-4' />
              <span>إنشاء سنة مالية جديدة</span>
            </Button>
          </div>

          <Card>
            <CardContent className='pt-6'>
              {isLoadingPeriods ? (
                <div className='py-8 text-center text-muted-foreground'>
                  جاري تحميل الفترات...
                </div>
              ) : periods.length === 0 ? (
                <div className='py-8 text-center text-muted-foreground'>
                  لا توجد فترات مالية بعد. اضغط على &quot;إنشاء سنة مالية جديدة&quot; للبدء.
                </div>
              ) : (
                <div className='overflow-x-auto'>
                  <table className='w-full text-xs text-right'>
                    <thead className='bg-muted/50 text-muted-foreground'>
                      <tr>
                        <th className='p-3'>الفترة المالية</th>
                        <th className='p-3'>تاريخ البداية</th>
                        <th className='p-3'>تاريخ النهاية</th>
                        <th className='p-3'>الحالة</th>
                        <th className='p-3'>الإجراء</th>
                      </tr>
                    </thead>
                    <tbody className='divide-y'>
                      {periods.map((period) => {
                        const isOpen = period.status === 'open'
                        return (
                          <tr key={period.id} className='hover:bg-muted/20'>
                            <td className='p-3 font-semibold'>
                              {period.period_number ? `فترة شهر ${period.period_number}` : period.id.slice(0, 8)}
                            </td>
                            <td className='p-3 font-mono'>{period.start_date}</td>
                            <td className='p-3 font-mono'>{period.end_date}</td>
                            <td className='p-3'>
                              <Badge
                                variant={isOpen ? 'outline' : 'secondary'}
                                className={isOpen ? 'text-emerald-600 border-emerald-500/30' : 'text-muted-foreground'}
                              >
                                {isOpen ? 'مفتوحة للترحيل' : 'مقفلة'}
                              </Badge>
                            </td>
                            <td className='p-3'>
                              {isOpen ? (
                                <Button
                                  variant='ghost'
                                  size='sm'
                                  className='h-7 text-xs text-amber-600 hover:text-amber-700 gap-1'
                                  onClick={() => closePeriodMutation.mutate(period.id)}
                                  disabled={closePeriodMutation.isPending}
                                >
                                  <Lock className='size-3' />
                                  <span>إقفال الفترة</span>
                                </Button>
                              ) : (
                                <span className='text-xs text-muted-foreground'>مقفلة</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* 3. تبويب سجل التدقيق */}
      {activeSubTab === 'audit' && (
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>سجل التدقيق المحاسبي (Audit Log)</CardTitle>
            <CardDescription>
              سجل تفصيلي لكافة العمليات المالية، الترحيل، الإنشاء، والتعديلات بالوقت والمستخدم
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingAudit ? (
              <div className='py-8 text-center text-muted-foreground'>
                جاري تحميل سجل التدقيق...
              </div>
            ) : auditLogs.length === 0 ? (
              <div className='py-8 text-center text-muted-foreground'>
                لا توجد عمليات مسجلة في سجل التدقيق حتى الآن.
              </div>
            ) : (
              <div className='overflow-x-auto'>
                <table className='w-full text-xs text-right'>
                  <thead className='bg-muted/50 text-muted-foreground'>
                    <tr>
                      <th className='p-3'>الوقت</th>
                      <th className='p-3'>نوع الكيان</th>
                      <th className='p-3'>الإجراء</th>
                      <th className='p-3'>معرف المستخدم</th>
                      <th className='p-3'>التفاصيل</th>
                    </tr>
                  </thead>
                  <tbody className='divide-y'>
                    {auditLogs.map((log) => (
                      <tr key={log.id} className='hover:bg-muted/20'>
                        <td className='p-3 font-mono text-muted-foreground'>
                          {new Date(log.created_at).toLocaleString('ar-YE')}
                        </td>
                        <td className='p-3 font-semibold'>{log.entity_type}</td>
                        <td className='p-3'>
                          <Badge variant='outline'>{log.action}</Badge>
                        </td>
                        <td className='p-3 font-mono text-muted-foreground'>
                          {log.actor_user_id ? log.actor_user_id.slice(0, 10) : 'نظام'}
                        </td>
                        <td className='p-3 font-mono text-muted-foreground max-w-xs truncate' title={JSON.stringify(log.details)}>
                          {JSON.stringify(log.details)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* مودال إنشاء سنة مالية */}
      <Dialog open={isAddYearOpen} onOpenChange={setIsAddYearOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>إنشاء سنة مالية جديدة</DialogTitle>
            <DialogDescription>
              يتم إنشاء السنة المالية وتقسيمها تلقائياً إلى 12 فترة محاسبية شهرية متتالية.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateYear} className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='year-name'>اسم السنة المالية</Label>
              <Input
                id='year-name'
                placeholder='مثال: السنة المالية 2026'
                value={yearName}
                onChange={(e) => setYearName(e.target.value)}
                required
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='start-month'>شهر بداية السنة</Label>
              <Input
                id='start-month'
                type='month'
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
                required
              />
            </div>
            <DialogFooter className='gap-2 sm:gap-0'>
              <Button type='button' variant='outline' onClick={() => setIsAddYearOpen(false)}>
                إلغاء
              </Button>
              <Button type='submit' disabled={createYearMutation.isPending}>
                إنشاء السنة والفترات
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
