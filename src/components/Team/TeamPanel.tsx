import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  ExternalLink,
  GitCommitHorizontal,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useApp, TeamResource } from '../../context/AppContext';
import {
  GitHubCollaborator,
  GitHubCollaboratorPermission,
  GitHubContributor,
  GitHubContributorStatistics,
  GitHubUser,
} from '../../types';
import {
  contributorLabel,
  contributorPercent,
  isAnonymousContributor,
  permissionToTeamRole,
  sortContributors,
  teamRoleToPermission,
} from '../../lib/team';
import { connectionError } from '../../lib/connectionErrors';
import { ConnectionErrorPanel } from '../common/ConnectionErrorPanel';
import { SelectMenu } from '../common/SelectMenu';

interface TeamPanelProps {
  onShowCommits: (login: string) => void;
}

type TeamSection = 'collaborators' | 'contributors';
type ConfirmAction =
  | { kind: 'remove'; login: string; label: string }
  | { kind: 'role'; login: string; label: string; permission: GitHubCollaboratorPermission }
  | { kind: 'invitation'; id: number; label: string };

const ROLE_OPTIONS: Array<{ value: GitHubCollaboratorPermission; label: string; description: string; details: string }> = [
  { value: 'pull', label: 'Read', description: 'Только чтение', details: 'Можно просматривать код, историю, issues и pull requests без записи изменений.' },
  { value: 'triage', label: 'Triage', description: 'Управление задачами и PR', details: 'Можно управлять issues, обсуждениями и pull requests, но нельзя записывать код.' },
  { value: 'push', label: 'Write', description: 'Чтение и запись кода', details: 'Можно отправлять изменения в репозиторий и работать с проектом на уровне записи.' },
  { value: 'maintain', label: 'Maintain', description: 'Управление репозиторием', details: 'Можно управлять репозиторием, но нельзя выполнять чувствительные или разрушительные действия.' },
  { value: 'admin', label: 'Admin', description: 'Полный доступ', details: 'Полный доступ к проекту, включая управление доступом, безопасность и удаление репозитория.' },
];

const ROLE_RANK: Record<GitHubCollaboratorPermission, number> = {
  pull: 1,
  triage: 2,
  push: 3,
  maintain: 4,
  admin: 5,
};

function Avatar({ src, label }: { src?: string; label: string }) {
  return src ? (
    <img src={src} alt="" className="h-9 w-9 flex-none rounded-lg object-cover" />
  ) : (
    <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-[var(--surface-strong)] text-xs font-bold text-[var(--muted)]">
      {label.slice(0, 1).toUpperCase() || '?'}
    </span>
  );
}

function ResourceState<T>({ resource, onRetry }: { resource: TeamResource<T>; onRetry: () => void }) {
  if (resource.state === 'loading') {
    return <div className="flex items-center gap-2 px-3 py-6 text-xs text-[var(--muted)]"><LoaderCircle size={15} className="animate-spin" /> Загрузка данных…</div>;
  }
  if (resource.state === 'forbidden' || resource.state === 'error') {
    const info = connectionError(resource.state === 'forbidden' ? 'permissions' : 'github', resource.error);
    return <ConnectionErrorPanel error={info} onAction={onRetry} compact />;
  }
  return null;
}

function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('ru-RU');
}

function formatWeek(value?: number) {
  if (!value) return '—';
  return formatDate(new Date(value * 1000).toISOString());
}

function collaboratorPermission(collaborator: GitHubCollaborator): GitHubCollaboratorPermission {
  const role = permissionToTeamRole(collaborator.role_name, collaborator.permissions);
  return teamRoleToPermission(role);
}

function ConfirmDialog({
  action,
  busy,
  onCancel,
  onConfirm,
}: {
  action: ConfirmAction;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const nextRole = action.kind === 'role'
    ? ROLE_OPTIONS.find(option => option.value === action.permission)
    : undefined;
  const title = action.kind === 'remove'
    ? 'Удалить участника?'
    : action.kind === 'role'
      ? 'Понизить роль?'
      : 'Отменить приглашение?';
  const detail = action.kind === 'remove'
    ? `Доступ @${action.label} к репозиторию будет отозван.`
    : action.kind === 'role'
      ? `Роль @${action.label} изменится на ${nextRole ? `${nextRole.label} — ${nextRole.description}` : 'выбранное разрешение'}.`
      : `Открытое приглашение для @${action.label} будет отменено.`;
  return (
    <div className="modal-overlay fixed inset-0 z-[120] grid place-items-center p-4" role="presentation">
      <div className="modal-panel w-full max-w-sm rounded-2xl p-5" role="dialog" aria-modal="true" aria-labelledby="team-confirm-title">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="team-confirm-title" className="text-base font-bold">{title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{detail}</p>
          </div>
          <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-soft)]" onClick={onCancel} aria-label="Закрыть"><X size={16} /></button>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="h-9 rounded-lg border border-[var(--line)] px-3 text-xs font-semibold" onClick={onCancel} disabled={busy}>Отмена</button>
          <button type="button" className="h-9 rounded-lg bg-[var(--ink)] px-3 text-xs font-semibold text-[var(--on-ink)]" onClick={onConfirm} disabled={busy}>
            {busy ? 'Сохраняем…' : 'Подтвердить'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddCollaboratorModal({
  defaultPermission,
  busy,
  onClose,
  onSubmit,
}: {
  defaultPermission: GitHubCollaboratorPermission;
  busy: boolean;
  onClose: () => void;
  onSubmit: (login: string, permission: GitHubCollaboratorPermission) => Promise<boolean>;
}) {
  const [login, setLogin] = useState('');
  const [permission, setPermission] = useState<GitHubCollaboratorPermission>(defaultPermission);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanLogin = login.trim();
    if (!cleanLogin) return;
    if (await onSubmit(cleanLogin, permission)) onClose();
  };
  return (
    <div className="modal-overlay fixed inset-0 z-[110] grid place-items-center p-4" role="presentation">
      <form className="modal-panel w-full max-w-md rounded-2xl p-5" role="dialog" aria-modal="true" aria-labelledby="team-add-title" onSubmit={submit}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="team-add-title" className="text-base font-bold">Добавить участника</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">GitHub username без ссылки и email.</p>
          </div>
          <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-soft)]" onClick={onClose} aria-label="Закрыть"><X size={16} /></button>
        </div>
        <label className="mt-5 block text-xs font-semibold" htmlFor="team-login">Username</label>
        <input id="team-login" autoFocus value={login} onChange={event => setLogin(event.target.value)} placeholder="octocat" className="focus-surface mt-2 h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-sm outline-none" autoComplete="off" />
        <label className="mt-4 block text-xs font-semibold">Разрешение (Permission)</label>
        <div className="mt-2"><SelectMenu value={permission} options={ROLE_OPTIONS} onChange={value => setPermission(value as GitHubCollaboratorPermission)} ariaLabel="Разрешение нового участника (Permission)" /></div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="h-9 rounded-lg border border-[var(--line)] px-3 text-xs font-semibold" onClick={onClose} disabled={busy}>Отмена</button>
          <button type="submit" className="flex h-9 items-center gap-2 rounded-lg bg-[var(--ink)] px-3 text-xs font-semibold text-[var(--on-ink)]" disabled={busy || !login.trim()}>
            {busy ? <LoaderCircle size={14} className="animate-spin" /> : <UserPlus size={14} />}
            {busy ? 'Отправляем…' : 'Добавить'}
          </button>
        </div>
      </form>
    </div>
  );
}

function ProfileButton({ profile, login, onOpen }: { profile?: GitHubUser | null; login: string; onOpen: () => void }) {
  return (
    <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-50" onClick={onOpen} disabled={!login}>
      {profile?.name || `@${login}`} <ExternalLink size={12} />
    </button>
  );
}

function StatsDetail({ contributor, statistics, timeline }: { contributor: GitHubContributor; statistics?: GitHubContributorStatistics; timeline: TeamResource<unknown> | null }) {
  const weekData = statistics?.weeks?.filter(week => week.c > 0) || [];
  const additions = statistics ? statistics.weeks.reduce((total, week) => total + week.a, 0) : null;
  const deletions = statistics ? statistics.weeks.reduce((total, week) => total + week.d, 0) : null;
  return (
    <div className="mt-4 border-t border-[var(--line)] pt-4">
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div><span className="block text-[var(--muted)]">Commits</span><b className="mt-1 block tabular-nums">{statistics?.total ?? contributor.contributions}</b></div>
        <div><span className="block text-[var(--muted)]">Additions / deletions</span><b className="mt-1 block tabular-nums">{additions === null ? '—' : `+${additions} / −${deletions}`}</b></div>
        <div><span className="block text-[var(--muted)]">First activity</span><b className="mt-1 block">{formatWeek(weekData[0]?.w)}</b></div>
        <div><span className="block text-[var(--muted)]">Latest activity</span><b className="mt-1 block">{formatWeek(weekData[weekData.length - 1]?.w)}</b></div>
      </div>
      {timeline?.state === 'loaded' && timeline.items.length === 0 && (
        <p className="mt-4 rounded-lg bg-[var(--surface-soft)] px-3 py-2 text-xs text-[var(--muted)]">В загруженной истории коммиты не найдены.</p>
      )}
      {timeline?.state === 'error' && <p className="mt-4 text-xs text-[var(--muted)]">Историю автора не удалось загрузить.</p>}
    </div>
  );
}

export const TeamPanel: React.FC<TeamPanelProps> = ({ onShowCommits }) => {
  const {
    project,
    repositoryInfo,
    loading,
    teamCollaborators,
    teamInvitations,
    teamContributors,
    teamStats,
    loadTeam,
    refreshTeam,
    loadTeamProfile,
    loadTeamContributorTimeline,
    addTeamCollaborator,
    updateTeamCollaborator,
    removeTeamCollaborator,
    cancelTeamInvitation,
    openExternal,
    userWebUrl,
  } = useApp();
  const [section, setSection] = useState<TeamSection>('collaborators');
  const [selectedCollaborator, setSelectedCollaborator] = useState<GitHubCollaborator | null>(null);
  const [selectedContributor, setSelectedContributor] = useState<GitHubContributor | null>(null);
  const [sort, setSort] = useState<'commits' | 'name'>('commits');
  const [profile, setProfile] = useState<GitHubUser | null>(null);
  const [timeline, setTimeline] = useState<TeamResource<unknown> | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);

  const [owner, repo] = project?.repo.split('/') || ['', ''];
  const ownerLogin = repositoryInfo?.owner?.login || owner;
  const archived = Boolean(repositoryInfo?.archived || repositoryInfo?.disabled);
  const canManage = !archived && repositoryInfo?.permissions?.admin === true;
  const defaultPermission: GitHubCollaboratorPermission = repositoryInfo?.owner?.type === 'Organization' ? 'pull' : 'push';
  const totalContributions = useMemo(
    () => teamContributors.items.reduce((total, contributor) => total + Math.max(0, contributor.contributions || 0), 0),
    [teamContributors.items],
  );
  const sortedContributors = useMemo(() => sortContributors(teamContributors.items, sort), [teamContributors.items, sort]);
  const selectedStats = selectedContributor?.login
    ? teamStats.items.find(stat => stat.author?.login === selectedContributor.login)
    : undefined;

  useEffect(() => {
    void loadTeam();
    setSelectedCollaborator(null);
    setSelectedContributor(null);
    setProfile(null);
    setTimeline(null);
  }, [project?.id]);

  useEffect(() => {
    let active = true;
    if (!selectedCollaborator?.login) {
      setProfile(null);
      return () => { active = false; };
    }
    void loadTeamProfile(selectedCollaborator.login).then(next => { if (active) setProfile(next); });
    return () => { active = false; };
  }, [selectedCollaborator?.login]);

  useEffect(() => {
    let active = true;
    const login = selectedContributor?.login;
    if (!login) {
      setTimeline(null);
      return () => { active = false; };
    }
    setTimeline({ state: 'loading', items: [] });
    void loadTeamContributorTimeline(login).then(next => { if (active) setTimeline(next); });
    return () => { active = false; };
  }, [selectedContributor?.login]);

  useEffect(() => {
    setSelectedCollaborator(current => current
      ? teamCollaborators.items.find(collaborator => collaborator.login === current.login) ?? null
      : null);
  }, [teamCollaborators.items]);

  useEffect(() => {
    setSelectedContributor(current => current
      ? teamContributors.items.find(contributor => contributor.login === current.login) ?? null
      : null);
  }, [teamContributors.items]);

  const selectedPermission = selectedCollaborator ? collaboratorPermission(selectedCollaborator) : 'pull';
  const openProfile = (login: string, url?: string) => {
    if (url) void openExternal(url);
    else if (login) void openExternal(userWebUrl(login));
  };
  const changePermission = async (permission: GitHubCollaboratorPermission) => {
    if (!selectedCollaborator || permission === selectedPermission) return;
    if (ROLE_RANK[permission] < ROLE_RANK[selectedPermission]) {
      setConfirm({ kind: 'role', login: selectedCollaborator.login, label: selectedCollaborator.login, permission });
      return;
    }
    await updateTeamCollaborator(owner, repo, selectedCollaborator.login, permission);
  };
  const confirmAction = async () => {
    if (!confirm) return;
    if (confirm.kind === 'remove') await removeTeamCollaborator(owner, repo, confirm.login);
    if (confirm.kind === 'role') await updateTeamCollaborator(owner, repo, confirm.login, confirm.permission);
    if (confirm.kind === 'invitation') await cancelTeamInvitation(owner, repo, confirm.id);
    setConfirm(null);
  };

  if (!project) return null;

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-[var(--surface)]" data-team-panel>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold"><Users size={16} /> Team</div>
          <p className="mt-1 text-xs text-[var(--muted)]">Доступ к репозиторию и вклад в историю — разные списки.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--line)] text-[var(--muted)] hover:bg-[var(--surface-soft)]" onClick={() => void refreshTeam()} aria-label="Обновить Team" data-team-refresh><RefreshCw size={15} /></button>
          {section === 'collaborators' && <button type="button" className="flex h-9 items-center gap-2 rounded-lg bg-[var(--ink)] px-3 text-xs font-semibold text-[var(--on-ink)] disabled:opacity-50" onClick={() => setAddOpen(true)} disabled={!canManage} data-team-add><UserPlus size={14} /> Добавить</button>}
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-[var(--line)] px-3 py-2">
        <button type="button" className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${section === 'collaborators' ? 'bg-[var(--ink)] text-[var(--on-ink)]' : 'text-[var(--muted)] hover:bg-[var(--surface-soft)]'}`} onClick={() => setSection('collaborators')} data-team-collaborators-tab><Users size={13} className="mr-1.5 inline" />Collaborators</button>
        <button type="button" className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${section === 'contributors' ? 'bg-[var(--ink)] text-[var(--on-ink)]' : 'text-[var(--muted)] hover:bg-[var(--surface-soft)]'}`} onClick={() => setSection('contributors')} data-team-contributors-tab><GitCommitHorizontal size={13} className="mr-1.5 inline" />Contributors</button>
      </div>

      {archived && <div className="flex items-center gap-2 border-b border-[var(--line)] bg-[var(--surface-soft)] px-4 py-2.5 text-xs text-[var(--muted)]"><ShieldAlert size={14} /> Архивный репозиторий: операции с доступом защищены.</div>}
      {!archived && section === 'collaborators' && repositoryInfo && !canManage && <div className="border-b border-[var(--line)] bg-[var(--surface-soft)] px-4 py-2.5 text-xs text-[var(--muted)]">Для управления участниками нужны права Administration: write.</div>}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        {section === 'collaborators' ? (
          <>
            <div className="min-w-0 overflow-auto p-3 sm:p-4">
              <div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-xs font-bold uppercase tracking-[.08em] text-[var(--muted)]">Доступ к репозиторию</h3><span className="text-xs tabular-nums text-[var(--muted)]">{teamCollaborators.items.length || '—'}</span></div>
              <ResourceState resource={teamCollaborators} onRetry={() => void refreshTeam()} />
              {teamCollaborators.state === 'empty' && <p className="rounded-lg bg-[var(--surface-soft)] px-3 py-4 text-xs text-[var(--muted)]">Активных collaborators нет.</p>}
              {teamCollaborators.state === 'loaded' && <div className="space-y-1" data-team-collaborator-list>{teamCollaborators.items.map(collaborator => {
                const protectedOwner = collaborator.login === ownerLogin;
                const active = selectedCollaborator?.login === collaborator.login;
                return (
                  <button key={collaborator.login} type="button" className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left ${active ? 'border-[var(--sage)] bg-[var(--surface-soft)]' : 'border-transparent hover:border-[var(--line)] hover:bg-[var(--surface-soft)]'}`} onClick={() => setSelectedCollaborator(collaborator)} data-team-collaborator={collaborator.login}>
                    <Avatar src={collaborator.avatar_url} label={collaborator.login} />
                    <span className="min-w-0 flex-1"><b className="block truncate text-sm">{collaborator.name || collaborator.login}</b><span className="block truncate text-xs text-[var(--muted)]">@{collaborator.login}</span></span>
                    <span className="flex-none text-right"><b className="block text-xs">{protectedOwner ? 'Owner' : permissionToTeamRole(collaborator.role_name, collaborator.permissions)}</b><span className="block text-xs text-[var(--muted)]">active</span></span>
                    <ChevronRight size={14} className="flex-none text-[var(--muted)]" />
                  </button>
                );
              })}</div>}

              <div className="mt-6 border-t border-[var(--line)] pt-4">
                <div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-xs font-bold uppercase tracking-[.08em] text-[var(--muted)]">Ожидающие приглашения</h3><span className="text-xs tabular-nums text-[var(--muted)]">{teamInvitations.items.length || '—'}</span></div>
                <ResourceState resource={teamInvitations} onRetry={() => void refreshTeam()} />
                {teamInvitations.state === 'empty' && <p className="rounded-lg bg-[var(--surface-soft)] px-3 py-4 text-xs text-[var(--muted)]">Открытых приглашений нет.</p>}
                {teamInvitations.state === 'loaded' && <div className="space-y-1" data-team-invitations>{teamInvitations.items.map(invitation => {
                  const login = invitation.invitee?.login || 'пользователь';
                  return <div key={invitation.id} className="flex items-center gap-3 rounded-xl border border-[var(--line)] px-3 py-2.5"><Avatar src={invitation.invitee?.avatar_url} label={login} /><span className="min-w-0 flex-1"><b className="block truncate text-sm">{invitation.invitee?.name || login}</b><span className="block text-xs text-[var(--muted)]">@{login} · {formatDate(invitation.created_at)}</span></span><button type="button" className="h-8 rounded-lg border border-[var(--line)] px-2 text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-50" onClick={() => setConfirm({ kind: 'invitation', id: invitation.id, label: login })} disabled={!canManage} data-team-cancel-invitation={String(invitation.id)}>Отменить</button></div>;
                })}</div>}
              </div>
            </div>

            <aside className="border-t border-[var(--line)] p-4 lg:border-l lg:border-t-0" data-team-collaborator-detail>
              {selectedCollaborator ? (
                <div>
                  <div className="flex items-start gap-3"><Avatar src={selectedCollaborator.avatar_url} label={selectedCollaborator.login} /><div className="min-w-0 flex-1"><h3 className="truncate text-base font-bold">{profile?.name || selectedCollaborator.name || selectedCollaborator.login}</h3><p className="text-xs text-[var(--muted)]">@{selectedCollaborator.login}</p><div className="mt-2"><ProfileButton profile={profile} login={selectedCollaborator.login} onOpen={() => openProfile(selectedCollaborator!.login, selectedCollaborator!.html_url)} /></div></div></div>
                  <div className="mt-5"><span className="mb-2 block text-xs font-semibold text-[var(--muted)]">Разрешение (Permission)</span><SelectMenu value={selectedPermission} options={ROLE_OPTIONS} onChange={value => void changePermission(value as GitHubCollaboratorPermission)} ariaLabel="Разрешение участника (Permission)" disabled={!canManage || selectedCollaborator.login === ownerLogin} /></div>
                  {selectedCollaborator.login === ownerLogin && <p className="mt-3 text-xs text-[var(--muted)]">Владелец защищён: его нельзя удалить или понизить.</p>}
                  <button type="button" className="mt-5 flex h-9 items-center gap-2 rounded-lg border border-[rgba(161,108,98,.35)] px-3 text-xs font-semibold text-[#A16C62] hover:bg-[var(--danger-soft)] disabled:opacity-50" onClick={() => setConfirm({ kind: 'remove', login: selectedCollaborator!.login, label: selectedCollaborator!.login })} disabled={!canManage || selectedCollaborator.login === ownerLogin} data-team-remove><Trash2 size={14} /> Удалить доступ</button>
                </div>
              ) : <div className="flex h-full min-h-36 items-center justify-center text-center text-xs text-[var(--muted)]">Выберите collaborator, чтобы увидеть роль и действия.</div>}
            </aside>
          </>
        ) : (
          <>
            <div className="min-w-0 overflow-auto p-3 sm:p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-xs font-bold uppercase tracking-[.08em] text-[var(--muted)]">Авторы истории</h3><p className="mt-1 text-xs text-[var(--muted)]">Точные совпадения с доступом — только по GitHub login.</p></div><div className="w-36"><SelectMenu value={sort} options={[{ value: 'commits', label: 'Most commits' }, { value: 'name', label: 'Name' }]} onChange={value => setSort(value as 'commits' | 'name')} ariaLabel="Сортировка contributors" /></div></div>
              {teamStats.state === 'pending' && <p className="mb-3 rounded-lg bg-[var(--surface-soft)] px-3 py-2 text-xs text-[var(--muted)]">GitHub рассчитывает статистику. Недоступные значения будут показаны как —.</p>}
              <ResourceState resource={teamContributors} onRetry={() => void refreshTeam()} />
              {teamContributors.state === 'empty' && <p className="rounded-lg bg-[var(--surface-soft)] px-3 py-4 text-xs text-[var(--muted)]">В истории пока нет авторов.</p>}
              {teamContributors.state === 'loaded' && <div className="space-y-1" data-team-contributor-list>{sortedContributors.map(contributor => {
                const active = selectedContributor?.login === contributor.login && !isAnonymousContributor(contributor);
                const percent = contributorPercent(contributor.contributions, totalContributions);
                const anonymous = isAnonymousContributor(contributor);
                return <button key={`${contributor.login || contributor.email || contributor.name || 'anonymous'}-${contributor.contributions}`} type="button" className={`w-full rounded-xl border px-3 py-2.5 text-left ${active ? 'border-[var(--sage)] bg-[var(--surface-soft)]' : 'border-transparent hover:border-[var(--line)] hover:bg-[var(--surface-soft)]'} ${anonymous ? 'cursor-default' : ''}`} onClick={() => !anonymous && setSelectedContributor(contributor)} disabled={anonymous} data-team-contributor={contributor.login || 'anonymous'}><div className="flex items-center gap-3"><Avatar src={contributor.avatar_url} label={contributorLabel(contributor)} /><span className="min-w-0 flex-1"><b className="block truncate text-sm">{contributorLabel(contributor)}</b><span className="block truncate text-xs text-[var(--muted)]">{contributor.login ? `@${contributor.login}` : 'anonymous / unmatched'}</span></span><span className="flex-none text-right"><b className="block tabular-nums text-xs">{contributor.contributions}</b><span className="block text-xs text-[var(--muted)]">{percent.toFixed(percent >= 10 ? 0 : 1)}%</span></span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-strong)]"><div className="h-full rounded-full bg-[var(--sage)]" style={{ width: `${percent}%` }} /></div></button>;
              })}</div>}
            </div>
            <aside className="border-t border-[var(--line)] p-4 lg:border-l lg:border-t-0" data-team-contributor-detail>
              {selectedContributor && selectedContributor.login ? (
                <div><div className="flex items-start gap-3"><Avatar src={selectedContributor.avatar_url} label={contributorLabel(selectedContributor)} /><div className="min-w-0 flex-1"><h3 className="truncate text-base font-bold">{profile?.name || selectedContributor.name || selectedContributor.login}</h3><p className="text-xs text-[var(--muted)]">@{selectedContributor.login}</p><div className="mt-2"><ProfileButton profile={profile} login={selectedContributor.login} onOpen={() => openProfile(selectedContributor!.login!, selectedContributor!.html_url)} /></div></div></div><StatsDetail contributor={selectedContributor} statistics={selectedStats} timeline={timeline} /><button type="button" className="mt-4 flex h-9 items-center gap-2 rounded-lg bg-[var(--ink)] px-3 text-xs font-semibold text-[var(--on-ink)]" onClick={() => onShowCommits(selectedContributor!.login!)} data-team-show-commits><GitCommitHorizontal size={14} /> Show commits</button></div>
              ) : selectedContributor ? <div className="text-xs text-[var(--muted)]">Anonymous contributor не связан с профилем GitHub, поэтому переходы и фильтр отключены.</div> : <div className="flex h-full min-h-36 items-center justify-center text-center text-xs text-[var(--muted)]">Выберите автора, чтобы увидеть статистику и историю.</div>}
            </aside>
          </>
        )}
      </div>

      {addOpen && <AddCollaboratorModal defaultPermission={defaultPermission} busy={loading} onClose={() => setAddOpen(false)} onSubmit={(login, permission) => addTeamCollaborator(owner, repo, login, permission)} />}
      {confirm && <ConfirmDialog action={confirm} busy={loading} onCancel={() => setConfirm(null)} onConfirm={() => void confirmAction()} />}
    </div>
  );
};
