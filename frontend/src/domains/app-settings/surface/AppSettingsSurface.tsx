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
import { LeftColumnShell, ColumnCard } from '../../../shared/ui';
import { SETTINGS_CATEGORIES, type SettingsCategoryId } from '../lib/settings-categories';
import { ProvidersSettingsPanel } from '../modules/providers';
import './AppSettingsSurface.css';

function PlaceholderCategoryPanel({ title }: { title: string }) {
  return (
    <ColumnCard title={title} description="Scaffolded category panel.">
      <p className="app-settings-placeholder">Settings controls for this category will be added next.</p>
    </ColumnCard>
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
                <button
                  key={category.id}
                  type="button"
                  className={`app-settings-category-item${active ? ' active' : ''}`}
                  onClick={() => setActiveCategory(category.id)}
                  aria-current={active ? 'page' : undefined}
                >
                  {category.label}
                </button>
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
