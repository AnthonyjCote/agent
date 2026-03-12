/**
 * Purpose: Compose app-settings page with left category column and right detail pane.
 * Responsibilities:
 * - Render category navigation in left column.
 * - Render category-specific content stacked in column cards on the right.
 */
// @tags: domain,app-settings,surface,layout
// @status: active
// @owner: founder
// @domain: app-settings
// @adr: none

import { useState } from 'react';
import { LeftColumnShell, ColumnCard, ContentCard } from '@/shared/ui';
import { SETTINGS_CATEGORIES, type SettingsCategoryId } from '@/domains/app-settings/lib/settings-categories';
import { ProvidersSettingsPanel } from '@/domains/app-settings/modules/providers';
import './AppSettingsSurface.css';

function PlaceholderCategoryPanel({ title }: { title: string }) {
  return (
    <ContentCard title={title} description="Scaffolded category panel.">
      <p className="app-settings-placeholder">Settings controls for this category will be added next.</p>
    </ContentCard>
  );
}

export function AppSettingsSurface() {
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>('providers');

  return (
    <div className="app-settings-surface">
      <LeftColumnShell
        left={
          <nav className="app-settings-category-nav" aria-label="Settings categories">
            {SETTINGS_CATEGORIES.map((category) => {
              const active = activeCategory === category.id;
              return (
                <ColumnCard
                  key={category.id}
                  as="button"
                  className="app-settings-category-item"
                  active={active}
                  title={category.label}
                  onClick={() => setActiveCategory(category.id)}
                  ariaCurrent={active ? 'page' : undefined}
                />
              );
            })}
          </nav>
        }
        right={
          <section className="app-settings-pane" aria-label="Settings content">
            {activeCategory === 'providers' ? <ProvidersSettingsPanel /> : null}
            {activeCategory === 'runtime' ? <PlaceholderCategoryPanel title="Runtime" /> : null}
            {activeCategory === 'security' ? <PlaceholderCategoryPanel title="Security" /> : null}
          </section>
        }
      />
    </div>
  );
}
