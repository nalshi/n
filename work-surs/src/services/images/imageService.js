import { arrayBufferToBase64 } from '../../core/encoding.js';
import { assertSafePathSegment } from '../../core/pathSafety.js';
import { putSingleFile } from '../storage/providers/githubProvider.js';

// ========================================================
// 🖼️ خدمة صور المنتجات
// منطق العمل هنا فقط (بناء المسار، تحويل الصورة).
// التخزين الفعلي مفوّض لمزود التخزين (githubProvider) —
// لو تغيّر المزود مستقبلاً، هذا الملف ما يتغيّر إطلاقاً.
// ========================================================
export async function uploadProductImage(env, username, productId, imageFile, variant = '', createOnly = false) {
  // ⭐ تحقق دفاعي إضافي: هذا المسار يُبنى ويُستخدم مباشرة كجزء من رابط
  // Contents API الخاص بـ GitHub (طلب HTTP فعلي)، فأي قيمة غير آمنة هنا قد
  // تعني كتابة الملف بمكان مختلف تماماً بالمستودع. productController.js
  // يتحقق أصلاً من شكل المعرّف، لكن نكرر التحقق هنا كخط دفاع ثانٍ مستقل.
  const safeUsername = assertSafePathSegment(username, 'اسم المستخدم');
  const safeProductId = assertSafePathSegment(productId, 'معرّف المنتج');
  const safeVariant = variant ? `-${assertSafePathSegment(variant, 'معرّف خيار المنتج')}` : '';

  const buffer = await imageFile.arrayBuffer();
  const base64 = arrayBufferToBase64(buffer);
  const path = `images/${safeUsername}/${safeProductId}${safeVariant}.webp`;
  return putSingleFile(env, path, base64, `🖼️ Product image [${safeUsername}/${safeProductId}]`, { createOnly });
}
