import { commitMultipleFiles } from '../storage/providers/githubProvider.js';
import { purgeCloudflareCache } from '../storage/providers/cloudflareCacheProvider.js';
import { waitForVercelDeployment } from '../storage/providers/vercelDeployProvider.js';
import { enqueueSync } from '../storage/syncQueue.js';
import { assertSafePathSegment } from '../../core/pathSafety.js';

// ========================================================
// 🎨 خدمة مزامنة ملف تخصيص المتجر (storefront_config.json) إلى GitHub
// يتيح لواجهة المتجر تحميل التخصيص بسرعة خاطفة عبر الـ CDN مع
// تحديث manifest.json و info.json تلقائياً لضمان الانعكاس الفوري.
// ========================================================

function createSelectionPayload(selectionRecord, timestamp) {
  return {
    version: 1,
    updated_at: timestamp,
    theme_id: selectionRecord.theme_id || selectionRecord.selections?.theme || '',
    theme_name: selectionRecord.theme_name || selectionRecord.theme_display_name || selectionRecord.theme_id || '',
    theme_display_name: selectionRecord.theme_display_name || '',
    theme_selections: selectionRecord.theme_selections || {},
    selections: selectionRecord.selections || {},
  };
}

export async function syncStorefrontConfigToGitHub(env, username, config, storeInfo = null, selectionRecord = null) {
  return enqueueSync(() => runStorefrontConfigSync(env, username, config, storeInfo, selectionRecord));
}

export async function syncStorefrontSelectionToGitHub(env, username, selection) {
  return enqueueSync(async () => {
    if (!username) return;
    assertSafePathSegment(username, 'اسم المتجر');
    const timestamp = Date.now();
    const selectionRecord = selection?.selections
      ? selection
      : { selections: selection };
    await commitMultipleFiles(env, [{
      path: `stores/${username}/storefront_selection.json`,
      content: JSON.stringify(createSelectionPayload(selectionRecord, timestamp), null, 2),
    }], `🎨 Update storefront theme selection [${username}]`);
    await purgeCloudflareCache(env);
  });
}

async function runStorefrontConfigSync(env, username, config, storeInfo, selectionRecord) {
  try {
    if (!username) return;
    assertSafePathSegment(username, 'اسم المتجر');

    const timestamp = Date.now();
    const configPath = `stores/${username}/storefront_config.json`;
    const manifestPath = `stores/${username}/manifest.json`;

    const files = [
      {
        path: configPath,
        content: JSON.stringify(config, null, 2),
      },
    ];
    if (selectionRecord) {
      files.push({
        path: `stores/${username}/storefront_selection.json`,
        content: JSON.stringify(createSelectionPayload(selectionRecord, timestamp), null, 2),
      });
    }

    // 🔄 تحديث المانيفست لرفع رقم الإصدار لكي تكتشف واجهة المتجر التحديث فوراً (Live Sync)
    const manifestData = {
      version: timestamp,
      last_updated: new Date(timestamp).toISOString(),
      theme: {
        id: config?.theme_name || '',
        name: config?.theme_display_name || config?.theme_name || '',
        display_name: config?.theme_display_name || config?.theme_name || '',
      },
      themes: {
        light: {
          id: config?.theme_selection?.light || config?.theme_name || '',
          name: config?.theme_display_names?.light || config?.theme_display_name || config?.theme_name || '',
        },
        dark: {
          id: config?.theme_selection?.dark || config?.theme_name || '',
          name: config?.theme_display_names?.dark || config?.theme_display_name || config?.theme_name || '',
        },
      },
      files: {
        storefront_config: timestamp,
      },
    };

    files.push({
      path: manifestPath,
      content: JSON.stringify(manifestData, null, 2),
    });

    // 🏪 مزامنة اسم ومعلومات المتجر في info.json إن كانت متوفرة
    if (config?.store_identity?.store_name || storeInfo) {
      const infoPath = `stores/${username}/info.json`;
      const infoPayload = {
        _version: timestamp,
        data: {
          id: storeInfo?.id != null ? String(storeInfo.id) : null,
          merchant_id: storeInfo?.id != null ? String(storeInfo.id) : null,
          store_name: config?.store_identity?.store_name || storeInfo?.store_name || '',
          store_type: storeInfo?.store_type || null,
          phone: config?.marketing?.whatsapp_floating?.phone || storeInfo?.phone || null,
          theme_id: config?.theme_name || '',
          theme_name: config?.theme_display_name || config?.theme_name || '',
          theme_display_name: config?.theme_display_name || config?.theme_name || '',
          theme_selections: {
            light: {
              id: config?.theme_selection?.light || config?.theme_name || '',
              name: config?.theme_display_names?.light || config?.theme_display_name || config?.theme_name || '',
            },
            dark: {
              id: config?.theme_selection?.dark || config?.theme_name || '',
              name: config?.theme_display_names?.dark || config?.theme_display_name || config?.theme_name || '',
            },
          },
          settings: {
            ...(storeInfo?.settings || {}),
            welcome_message: config?.store_identity?.welcome_message || '',
            slogan: config?.store_identity?.slogan || '',
            storefront_config: config,
          },
        },
      };

      files.push({
        path: infoPath,
        content: JSON.stringify(infoPayload, null, 2),
      });
    }

    const commitSha = await commitMultipleFiles(
      env,
      files,
      `🎨 Auto-sync storefront config & manifest [${username}]`
    );

    console.log(`[Storefront Config Sync Success] ${username} (commit: ${commitSha})`);

    // ⏳ انتظار نشر Vercel ليصبح READY إن كان مُهيأً
    if (commitSha) {
      await waitForVercelDeployment(env, commitSha);
    }

    // 🧹 مسح كاش Cloudflare بالكامل لينعكس التصميم الجديد للعملاء فوراً
    await purgeCloudflareCache(env);
  } catch (error) {
    console.error('Storefront Config Sync Error:', error);
  }
}
