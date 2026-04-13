This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Supabase Deployment Workflow

This repository includes helper scripts so database migration rollout can be done in one command.

1. Check current Supabase readiness:

```bash
npm run supabase:status
```

2. Run full migration deploy flow:

```bash
npm run supabase:deploy
```

What `supabase:deploy` does:

- Uses global `supabase` CLI if available, otherwise falls back to `npx -y supabase`
- Links the project automatically if `SUPABASE_PROJECT_REF` is set
- Runs `supabase db push --include-all`
- Prints `supabase migration list` as a post-check

Required environment variables for a fully automated run:

- `SUPABASE_PROJECT_REF`
- `SUPABASE_ACCESS_TOKEN` (after `supabase login`)
- `SUPABASE_DB_PASSWORD` (when required by your Supabase setup)

Application runtime variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
