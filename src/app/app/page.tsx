import React, { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { WorkspaceAppClient } from '@/components/app/WorkspaceAppClient';
import type { WorkspaceMemberRow, WorkspaceRow } from '@/types/database';

export default async function AppDashboardPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Ensure profile exists
  await supabase.rpc('ensure_user_profile');

  // Load user's workspaces
  const [wsRes, wsMemRes] = await Promise.all([
    supabase.from('workspaces').select('*').order('created_at'),
    supabase.from('workspace_members').select('*').eq('user_id', user.id),
  ]);

  const workspaces = (wsRes.data || []) as WorkspaceRow[];
  const memberships = (wsMemRes.data || []) as WorkspaceMemberRow[];

  if (workspaces.length === 0 || memberships.length === 0) {
    redirect('/onboarding');
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#FAF8F5] text-sm text-stone-500">
          กำลังโหลดพื้นที่ทำงาน...
        </div>
      }
    >
      <WorkspaceAppClient
        userId={user.id}
        initialWorkspaces={workspaces}
        initialWorkspaceMemberships={memberships}
      />
    </Suspense>
  );
}
