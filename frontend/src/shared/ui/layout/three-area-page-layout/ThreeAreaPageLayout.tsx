import type { ReactNode } from 'react';
import { ActionRail } from '@/shared/ui/layout/action-rail/ActionRail';
import { LeftColumnShell } from '@/shared/ui/layout/left-column-shell/LeftColumnShell';
import { TopRailShell } from '@/shared/ui/layout/top-rail-shell/TopRailShell';
import { WorkspaceSurface } from '@/shared/ui/layout/workspace-surface/WorkspaceSurface';
import './ThreeAreaPageLayout.css';

type ThreeAreaPageLayoutProps = {
  showTopRail?: boolean;
  topRailLeft?: ReactNode;
  topRailRight?: ReactNode;
  showLeftColumn?: boolean;
  leftColumnWidth?: 'standard' | 'wide';
  leftColumnContent?: ReactNode;
  showLeftColumnActionRail?: boolean;
  leftColumnActionRailLeft?: ReactNode;
  leftColumnActionRailRight?: ReactNode;
  showWorkspaceActionRail?: boolean;
  workspaceActionRailLeft?: ReactNode;
  workspaceActionRailRight?: ReactNode;
  workspaceContent: ReactNode;
  className?: string;
  workspaceClassName?: string;
  leftColumnClassName?: string;
};

export function ThreeAreaPageLayout({
  showTopRail = false,
  topRailLeft,
  topRailRight,
  showLeftColumn = false,
  leftColumnWidth = 'standard',
  leftColumnContent,
  showLeftColumnActionRail = false,
  leftColumnActionRailLeft,
  leftColumnActionRailRight,
  showWorkspaceActionRail = false,
  workspaceActionRailLeft,
  workspaceActionRailRight,
  workspaceContent,
  className,
  workspaceClassName,
  leftColumnClassName
}: ThreeAreaPageLayoutProps) {
  const rootClasses = ['three-area-page-layout', className].filter(Boolean).join(' ');
  const leftClasses = ['three-area-page-layout-left', leftColumnClassName].filter(Boolean).join(' ');

  const workspace = (
    <WorkspaceSurface className={['three-area-page-layout-workspace', workspaceClassName].filter(Boolean).join(' ')}>
      {showWorkspaceActionRail ? <ActionRail tone="raised" left={workspaceActionRailLeft} right={workspaceActionRailRight} /> : null}
      <div className="three-area-page-layout-workspace-body">{workspaceContent}</div>
    </WorkspaceSurface>
  );

  return (
    <section className={rootClasses}>
      {showTopRail ? (
        <div className="three-area-page-layout-top">
          <TopRailShell tone="raised" left={topRailLeft} right={topRailRight} />
        </div>
      ) : null}
      <div className="three-area-page-layout-main">
        {showLeftColumn ? (
          <LeftColumnShell
            width={leftColumnWidth}
            left={
              <aside className={leftClasses}>
                {showLeftColumnActionRail ? (
                  <ActionRail tone="raised" left={leftColumnActionRailLeft} right={leftColumnActionRailRight} />
                ) : null}
                <div className="three-area-page-layout-left-body">{leftColumnContent}</div>
              </aside>
            }
            right={workspace}
          />
        ) : (
          workspace
        )}
      </div>
    </section>
  );
}
