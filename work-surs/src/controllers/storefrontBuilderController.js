import { HttpError } from '../security/rbac.js';
import {
  DEFAULT_STOREFRONT_CONFIG,
  THEME_PRESETS,
  TIER_LIMITS,
  STORE_TIERS,
  sanitizeStorefrontConfig,
} from '../config/storefrontConfigSchema.js';
import { syncStorefrontConfigToGitHub, syncStorefrontSelectionToGitHub } from '../services/store/storefrontConfigSyncService.js';

// ========================================================
// 🎨 تحكم مصمم المتجر (Storefront Builder Controller)
// ========================================================

function parseSettings(value) {
  try {
    const settings = typeof value === 'string' ? JSON.parse(value) : value;
    return settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
  } catch {
    return {};
  }
}

function getThemePair(selection, fallbackThemeId) {
  const lightId = selection?.light || fallbackThemeId;
  const darkId = selection?.dark || fallbackThemeId;
  const lightTheme = THEME_PRESETS.find((theme) => theme.id === lightId);
  const darkTheme = THEME_PRESETS.find((theme) => theme.id === darkId);
  if (!lightTheme || !darkTheme) {
    throw new HttpError('يجب تحديد ثيم فاتح وثيم داكن صالحين.', 400);
  }
  return { lightTheme, darkTheme };
}

function createThemeSelectionRecord(lightTheme, darkTheme) {
  return {
    theme_id: lightTheme.id,
    theme_name: lightTheme.name,
    theme_display_name: lightTheme.name,
    theme_selections: {
      light: { id: lightTheme.id, name: lightTheme.name },
      dark: { id: darkTheme.id, name: darkTheme.name },
    },
    selections: {
      theme: lightTheme.id,
      light_theme: lightTheme.id,
      dark_theme: darkTheme.id,
    },
  };
}

/**
 * جلب تكوين المتجر المخصص
 * متاح للتاجر أو لزوار المتجر عبر username / store_id
 */
export async function getStorefrontConfig({ env, user, body }) {
  let targetUserId = user?.user_id;
  let targetUsername = user?.username || body?.username;

  if (body?.merchant_id || body?.store_id) {
    targetUserId = Number(body.merchant_id || body.store_id);
  }

  let row = null;
  if (targetUserId) {
    row = await env.DB.prepare(
      `SELECT id, username, store_name, store_type, settings, storefront_config, plan_type FROM users WHERE id = ?`
    )
      .bind(targetUserId)
      .first()
      .catch(async () => {
        // Fallback في حال لم يُضف عمود storefront_config أو plan_type بعد
        return await env.DB.prepare(
          `SELECT id, username, store_name, store_type, settings FROM users WHERE id = ?`
        )
          .bind(targetUserId)
          .first();
      });
  } else if (targetUsername) {
    row = await env.DB.prepare(
      `SELECT id, username, store_name, store_type, settings, storefront_config, plan_type FROM users WHERE username = ?`
    )
      .bind(targetUsername)
      .first()
      .catch(async () => {
        return await env.DB.prepare(
          `SELECT id, username, store_name, store_type, settings FROM users WHERE username = ?`
        )
          .bind(targetUsername)
          .first();
      });
  }

  let userTier = STORE_TIERS.FREE;
  let savedConfig = null;
  let settingsObj = {};
  let selectedTheme = null;

  if (row) {
    settingsObj = parseSettings(row.settings);

    userTier = row.plan_type || settingsObj.plan_type || settingsObj.tier || STORE_TIERS.FREE;

    if (row.storefront_config) {
      try {
        savedConfig = typeof row.storefront_config === 'string'
          ? JSON.parse(row.storefront_config)
          : row.storefront_config;
      } catch (e) {
        savedConfig = null;
      }
    } else if (settingsObj.storefront_config) {
      try {
        savedConfig = typeof settingsObj.storefront_config === 'string'
          ? JSON.parse(settingsObj.storefront_config)
          : settingsObj.storefront_config;
      } catch (e) {
        savedConfig = null;
      }
    }

    const storedSelection = settingsObj.storefront_selection || {};
    const legacyThemeId = storedSelection.theme_id
      || storedSelection.selections?.theme
      || storedSelection.theme
      || storedSelection.theme_name;
    const lightThemeId = storedSelection.selections?.light_theme
      || storedSelection.theme_selections?.light?.id
      || legacyThemeId;
    const darkThemeId = storedSelection.selections?.dark_theme
      || storedSelection.theme_selections?.dark?.id
      || legacyThemeId;
    selectedTheme = {
      light: THEME_PRESETS.find((theme) => theme.id === lightThemeId || theme.name === lightThemeId) || null,
      dark: THEME_PRESETS.find((theme) => theme.id === darkThemeId || theme.name === darkThemeId) || null,
    };
  }

  // دمج التكوين المحفوظ مع الافتراضي لضمان اكتمال كل الحقول
  let activeConfig = savedConfig || DEFAULT_STOREFRONT_CONFIG;
  if (selectedTheme?.light && selectedTheme?.dark &&
      (!savedConfig ||
       savedConfig.theme_selection?.light !== selectedTheme.light.id ||
       savedConfig.theme_selection?.dark !== selectedTheme.dark.id)) {
    activeConfig = {
      ...activeConfig,
      theme_name: selectedTheme.light.id,
      theme_selection: { light: selectedTheme.light.id, dark: selectedTheme.dark.id },
      theme_display_names: { light: selectedTheme.light.name, dark: selectedTheme.dark.name },
      light_theme: selectedTheme.light.light_theme,
      dark_theme: selectedTheme.dark.dark_theme,
    };
  }
  const { sanitizedConfig } = sanitizeStorefrontConfig(activeConfig, userTier);
  const configLightTheme = THEME_PRESETS.find((theme) => theme.id === sanitizedConfig.theme_selection?.light)
    || THEME_PRESETS.find((theme) => theme.id === sanitizedConfig.theme_name);
  const configDarkTheme = THEME_PRESETS.find((theme) => theme.id === sanitizedConfig.theme_selection?.dark)
    || configLightTheme;
  sanitizedConfig.theme_selection = {
    light: configLightTheme?.id || sanitizedConfig.theme_name,
    dark: configDarkTheme?.id || sanitizedConfig.theme_name,
  };
  sanitizedConfig.theme_display_names = {
    light: configLightTheme?.name || sanitizedConfig.theme_name,
    dark: configDarkTheme?.name || sanitizedConfig.theme_name,
  };
  sanitizedConfig.theme_display_name = configLightTheme?.name || sanitizedConfig.theme_name;

  // الحفاظ على updated_at الأصلي المحفوظ في D1 (sanitizeStorefrontConfig يولّد توقيتاً جديداً نتجنّبه هنا)
  if (activeConfig.updated_at) {
    sanitizedConfig.updated_at = activeConfig.updated_at;
  }

  return {
    data: {
      config: sanitizedConfig,
      tier: userTier,
      tier_limits: TIER_LIMITS[userTier] || TIER_LIMITS[STORE_TIERS.FREE],
      store_info: row
        ? {
            id: row.id,
            username: row.username,
            store_name: row.store_name,
            store_type: row.store_type,
          }
        : null,
    },
  };
}

/**
 * حفظ التخصيص الجديد للمتجر (تاجر مسجّل فقط)
 */
export async function saveStorefrontConfig({ env, ctx, user, body }) {
  if (!user || !user.user_id) {
    throw new HttpError('غير مصرح', 401);
  }

  const rawConfig = body.config;
  if (!rawConfig || typeof rawConfig !== 'object') {
    throw new HttpError('بيانات التخصيص (config) غير صالحة أو مفقودة.', 400);
  }

  // معرفة باقة التاجر الحالية
  const userRow = await env.DB.prepare(`SELECT id, username, settings, plan_type FROM users WHERE id = ?`)
    .bind(user.user_id)
    .first()
    .catch(async () => {
      return await env.DB.prepare(`SELECT id, username, settings FROM users WHERE id = ?`)
        .bind(user.user_id)
        .first();
    });

  if (!userRow) {
    throw new HttpError('المستخدم غير موجود', 404);
  }

  const settingsObj = parseSettings(userRow.settings);

  const userTier = userRow.plan_type || settingsObj.plan_type || settingsObj.tier || STORE_TIERS.FREE;

  // فحص وتنقية التكوين وتطبيق قواعد الباقة
  const { sanitizedConfig, notices } = sanitizeStorefrontConfig(rawConfig, userTier);
  const { lightTheme, darkTheme } = getThemePair(sanitizedConfig.theme_selection, sanitizedConfig.theme_name);
  sanitizedConfig.theme_name = lightTheme.id;
  sanitizedConfig.theme_selection = { light: lightTheme.id, dark: darkTheme.id };
  sanitizedConfig.theme_display_names = { light: lightTheme.name, dark: darkTheme.name };
  sanitizedConfig.theme_display_name = lightTheme.name;
  sanitizedConfig.light_theme = lightTheme.light_theme;
  sanitizedConfig.dark_theme = darkTheme.dark_theme;
  sanitizedConfig.modes = {
    light: { colors: lightTheme.light_theme.colors },
    dark: { colors: darkTheme.dark_theme.colors },
  };
  const configJson = JSON.stringify(sanitizedConfig);
  const selectionRecord = createThemeSelectionRecord(lightTheme, darkTheme);
  settingsObj.storefront_selection = selectionRecord;

  // تحديث قاعدة البيانات D1
  try {
    const update = selectionRecord
      ? env.DB.prepare(`UPDATE users SET storefront_config = ?, settings = ? WHERE id = ?`)
        .bind(configJson, JSON.stringify(settingsObj), user.user_id)
      : env.DB.prepare(`UPDATE users SET storefront_config = ? WHERE id = ?`)
        .bind(configJson, user.user_id);
    await update
      .run();
  } catch (dbErr) {
    // إذا لم يكن العمود موجوداً بعد، نخزنه مؤقتاً داخل حقل settings كـ fallback آمن
    settingsObj.storefront_config = sanitizedConfig;
    await env.DB.prepare(`UPDATE users SET settings = ? WHERE id = ?`)
      .bind(JSON.stringify(settingsObj), user.user_id)
      .run();
  }

  // مزامنة اسم المتجر في قاعدة البيانات إن تم تعديله من الاستوديو
  if (sanitizedConfig?.store_identity?.store_name) {
    try {
      await env.DB.prepare(`UPDATE users SET store_name = ? WHERE id = ?`)
        .bind(sanitizedConfig.store_identity.store_name, user.user_id)
        .run();
    } catch (e) {}
  }

  // مزامنة GitHub و Cloudflare Cache والمانيفست
  const syncPromise = syncStorefrontConfigToGitHub(
    env,
    userRow.username,
    sanitizedConfig,
    userRow,
    selectionRecord
  );
  if (ctx && ctx.waitUntil) {
    ctx.waitUntil(syncPromise);
  } else {
    syncPromise.catch((err) => console.error('Storefront direct sync error:', err));
  }

  let message = 'تم حفظ ونشر تصميم المتجر بنجاح 🎨';
  if (notices.length > 0) {
    message += ` (ملاحظة: ${notices[0]})`;
  }

  return {
    message,
    status: 'success',
    notices,
    config: sanitizedConfig,
    tier: userTier,
  };
}

/**
 * جلب قائمة الثيمات الجاهزة
 */
export async function getStorefrontThemes() {
  return {
    data: {
      themes: THEME_PRESETS,
    },
  };
}

export async function saveStorefrontSelection({ env, ctx, user, body }) {
  if (!user || !user.user_id) throw new HttpError('غير مصرح', 401);
  const selection = body?.selections;
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)) {
    throw new HttpError('اختيارات القالب غير صالحة.', 400);
  }
  const selectionKeys = Object.keys(selection);
  if (selectionKeys.length === 0 || selectionKeys.length > 6 ||
      !['theme', 'light_theme', 'dark_theme'].some((key) => Object.prototype.hasOwnProperty.call(selection, key))) {
    throw new HttpError('يجب تحديد ثيم فاتح وثيم داكن قبل النشر.', 400);
  }
  const allowedKeys = new Set(['theme', 'light_theme', 'dark_theme', 'font', 'layout', 'navigation', 'bot']);
  const cleanSelection = {};
  for (const key of selectionKeys) {
    const value = selection[key];
    if (!allowedKeys.has(key) || typeof value !== 'string' || value.length > 80 || !/^[a-z0-9_-]+$/i.test(value)) {
      throw new HttpError('اختيار قالب غير صالح.', 400);
    }
    cleanSelection[key] = value;
  }
  const fallbackTheme = cleanSelection.theme || cleanSelection.light_theme || cleanSelection.dark_theme;
  const { lightTheme, darkTheme } = getThemePair({
    light: cleanSelection.light_theme || fallbackTheme,
    dark: cleanSelection.dark_theme || fallbackTheme,
  }, fallbackTheme);
  const selectionRecord = createThemeSelectionRecord(lightTheme, darkTheme);
  Object.assign(selectionRecord.selections, cleanSelection);
  const row = await env.DB.prepare('SELECT id, username, settings FROM users WHERE id = ?').bind(user.user_id).first();
  if (!row) throw new HttpError('المستخدم غير موجود', 404);
  const settings = parseSettings(row.settings);
  settings.storefront_selection = selectionRecord;
  const settingsJson = JSON.stringify(settings);
  if (settingsJson.length > 256 * 1024) {
    throw new HttpError('تعذر حفظ اختيار الثيم بسبب تجاوز حجم إعدادات المتجر.', 413);
  }
  await env.DB.prepare('UPDATE users SET settings = ? WHERE id = ?').bind(settingsJson, user.user_id).run();
  const syncPromise = syncStorefrontSelectionToGitHub(env, row.username, selectionRecord);
  if (ctx?.waitUntil) {
    ctx.waitUntil(syncPromise.catch((error) => {
      console.error(`Storefront selection sync failed for ${row.username}:`, error);
    }));
  } else {
    await syncPromise;
  }
  return {
    status: 'success',
    message: 'تم حفظ الثيمين الفاتح والداكن وسيظهران على المتجر بعد اكتمال النشر.',
    selections: selectionRecord.selections,
    themes: {
      light: { id: lightTheme.id, name: lightTheme.name },
      dark: { id: darkTheme.id, name: darkTheme.name },
    },
    sync: 'queued',
  };
}
