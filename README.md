# بوابة التاجر

لوحة تحكم عربية لإدارة المتجر والمنتجات والطلبات، مبنية باستخدام React وShadcn UI وVite.

![alt text](public/images/shadcn-admin.png)

[![Sponsored by Clerk](https://img.shields.io/badge/Sponsored%20by-Clerk-5b6ee1?logo=clerk)](https://go.clerk.com/GttUAaK)

## Features

- لوحة رئيسية عربية متجاوبة مع دعم RTL
- متابعة المنتجات والطلبات وإجراءات التسليم
- إعدادات المتجر واختيار القالب
- تسجيل دخول التاجر وإدارة الجلسة
- وضع فاتح/داكن ومكونات واجهة قابلة للوصول

<details>
<summary>Customized Components (click to expand)</summary>

This project uses Shadcn UI components, but some have been slightly modified for better RTL (Right-to-Left) support and other improvements. These customized components differ from the original Shadcn UI versions.

If you want to update components using the Shadcn CLI (e.g., `npx shadcn@latest add <component>`), it's generally safe for non-customized components. For the listed customized ones, you may need to manually merge changes to preserve the project's modifications and avoid overwriting RTL support or other updates.

> If you don't require RTL support, you can safely update the 'RTL Updated Components' via the Shadcn CLI, as these changes are primarily for RTL compatibility. The 'Modified Components' may have other customizations to consider.

### Modified Components

- scroll-area
- sonner
- separator

### RTL Updated Components

- alert-dialog
- calendar
- command
- dialog
- dropdown-menu
- select
- table
- sheet
- sidebar
- switch

**Notes:**

- **Modified Components**: These have general updates, potentially including RTL adjustments.
- **RTL Updated Components**: These have specific changes for RTL language support (e.g., layout, positioning).
- For implementation details, check the source files in `src/components/ui/`.
- All other Shadcn UI components in the project are standard and can be safely updated via the CLI.

</details>

## Tech Stack

**UI:** [ShadcnUI](https://ui.shadcn.com) (TailwindCSS + RadixUI)

**Build Tool:** [Vite](https://vitejs.dev/)

**Routing:** [TanStack Router](https://tanstack.com/router/latest)

**Type Checking:** [TypeScript](https://www.typescriptlang.org/)

**Linting/Formatting:** [ESLint](https://eslint.org/) & [Prettier](https://prettier.io/)

**Icons:** [Lucide Icons](https://lucide.dev/icons/), [Tabler Icons](https://tabler.io/icons) (Brand icons only)

**Authentication:** Merchant API

## Merchant data synchronization

The authenticated dashboard restores its TanStack Query cache from IndexedDB and
uses a single bootstrap request when that merchant has no persisted snapshot.
While the dashboard is open, D1-backed order and product changes are delivered
over a hibernating Durable Object WebSocket and applied to the local cache.
Reconnects replay the merchant's event journal from the saved cursor.

Before deploying the Worker, apply its D1 migration from `work-surs`:

```bash
cd work-surs
pnpm dlx wrangler d1 migrations apply nalsh-db --remote --config src/wrangler.toml
```

The dashboard bootstrap and realtime endpoints also require the Cloudflare Pages
Function in `functions/api/work/[[path]].js`. Deploy the Pages Function together
with the site (a static-only `dist` upload does not deploy Functions), and set
`WORKER_URL` and `PROXY_SECRET` as server-side Pages environment variables.
`WORKER_URL` must point to the deployed API Worker, and `PROXY_SECRET` must match
the Worker's gateway secret. A successful bootstrap request should return JSON;
if `/api/work/api/merchant/bootstrap` returns the site's HTML page, the Pages
Function route is not active in that deployment.

The event journal supports replay while its rows are retained; it currently has
no pruning policy. IndexedDB persistence is local to each browser profile and
does not synchronize offline changes back to the server. Free-tier usage depends
on actual bootstrap, mutation, and concurrent-WebSocket volume, so it cannot be
guaranteed by the client-cache design alone.

## Run Locally

Clone the project

```bash
  git clone https://github.com/satnaing/shadcn-admin.git
```

Go to the project directory

```bash
  cd shadcn-admin
```

Install dependencies

```bash
  pnpm install
```

Start the server

```bash
  pnpm run dev
```

## Sponsoring this project ❤️

If you find this project helpful or use this in your own work, consider [sponsoring me](https://github.com/sponsors/satnaing) to support development and maintenance. You can [buy me a coffee](https://buymeacoffee.com/satnaing) as well. Don’t worry, every penny helps. Thank you! 🙏

For questions or sponsorship inquiries, feel free to reach out at [satnaingdev@gmail.com](mailto:satnaingdev@gmail.com).

### Current Sponsor

- [Clerk](https://go.clerk.com/GttUAaK) - authentication and user management for the modern web

## Author

Crafted with 🤍 by [@satnaing](https://github.com/satnaing)

## License

Licensed under the [MIT License](https://choosealicense.com/licenses/mit/)
