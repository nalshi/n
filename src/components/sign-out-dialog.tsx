import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import {
  getActiveMerchantToken,
  removeSavedMerchantAccount,
} from '@/lib/merchant-accounts'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { clearDashboardInitializationCache } from '@/features/dashboard/dashboard-data'
import { logoutMerchant } from '@/features/store-settings/store-settings-data'

interface SignOutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SignOutDialog({ open, onOpenChange }: SignOutDialogProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { auth } = useAuthStore()
  const logoutMutation = useMutation({
    mutationFn: logoutMerchant,
    onSuccess: () => {
      removeSavedMerchantAccount(getActiveMerchantToken())
      clearDashboardInitializationCache()
      queryClient.clear()
      auth.reset()
      onOpenChange(false)
      void navigate({ to: '/sign-in', replace: true })
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : 'تعذر تسجيل الخروج.'
      ),
  })

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title='تسجيل الخروج'
      desc='هل تريد إنهاء جلستك والخروج من حساب التاجر؟'
      cancelBtnText='إلغاء'
      confirmText='تسجيل الخروج'
      destructive
      handleConfirm={() => logoutMutation.mutate()}
      isLoading={logoutMutation.isPending}
      className='sm:max-w-sm'
    />
  )
}
