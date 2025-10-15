import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { PocketData } from "./PocketCard";

interface PocketAnalyticsProps {
  pockets: PocketData[];
  onClose: () => void;
}

interface AnalyticsData {
  totalPockets: number;
  totalContent: number;
  averageContentPerPocket: number;
  mostUsedTags: Array<{ tag: string; count: number }>;
  mostUsedCategories: Array<{ category: string; count: number }>;
  recentActivity: Array<{ date: string; count: number }>;
  largestPocket: { name: string; count: number } | null;
  oldestPocket: { name: string; date: string } | null;
  newestPocket: { name: string; date: string } | null;
}

export function PocketAnalytics({ pockets, onClose }: PocketAnalyticsProps) {
  const analytics = React.useMemo(() => calculateAnalytics(pockets), [pockets]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={cn(
          "w-full max-w-4xl max-h-[90vh] m-4 p-6 rounded-2xl shadow-2xl border overflow-y-auto",
          "bg-[rgba(17,25,40,0.75)] border-white/10 backdrop-blur-xl",
          "text-white"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold">Pocket Analytics</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {/* Total Pockets */}
          <StatCard
            title="Total Pockets"
            value={analytics.totalPockets}
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            }
          />

          {/* Total Content */}
          <StatCard
            title="Total Content Items"
            value={analytics.totalContent}
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
          />

          {/* Average Content */}
          <StatCard
            title="Avg. Items per Pocket"
            value={analytics.averageContentPerPocket.toFixed(1)}
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            }
          />
        </div>

        {/* Most Used Tags */}
        {analytics.mostUsedTags.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">Most Used Tags</h3>
            <div className="flex flex-wrap gap-2">
              {analytics.mostUsedTags.map(({ tag, count }) => (
                <div
                  key={tag}
                  className="px-4 py-2 rounded-lg bg-accent/50 border border-white/10 flex items-center gap-2"
                >
                  <span className="font-medium">{tag}</span>
                  <span className="text-sm text-muted-foreground">({count})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Most Used Categories */}
        {analytics.mostUsedCategories.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">Most Used Categories</h3>
            <div className="flex flex-wrap gap-2">
              {analytics.mostUsedCategories.map(({ category, count }) => (
                <div
                  key={category}
                  className="px-4 py-2 rounded-lg bg-accent/50 border border-white/10 flex items-center gap-2"
                >
                  <span className="font-medium">{category}</span>
                  <span className="text-sm text-muted-foreground">({count})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pocket Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {analytics.largestPocket && (
            <HighlightCard
              title="Largest Pocket"
              value={analytics.largestPocket.name}
              subtitle={`${analytics.largestPocket.count} items`}
              icon="📊"
            />
          )}
          {analytics.oldestPocket && (
            <HighlightCard
              title="Oldest Pocket"
              value={analytics.oldestPocket.name}
              subtitle={analytics.oldestPocket.date}
              icon="📅"
            />
          )}
          {analytics.newestPocket && (
            <HighlightCard
              title="Newest Pocket"
              value={analytics.newestPocket.name}
              subtitle={analytics.newestPocket.date}
              icon="✨"
            />
          )}
        </div>

        {/* Recent Activity */}
        {analytics.recentActivity.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-3">Recent Activity (Last 7 Days)</h3>
            <div className="space-y-2">
              {analytics.recentActivity.map(({ date, count }) => (
                <div
                  key={date}
                  className="flex items-center justify-between p-3 rounded-lg bg-accent/30 border border-white/10"
                >
                  <span className="text-sm">{date}</span>
                  <span className="text-sm font-medium">{count} updates</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="p-4 rounded-lg bg-accent/30 border border-white/10">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">{title}</span>
        <div className="text-muted-foreground">{icon}</div>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function HighlightCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: string;
}) {
  return (
    <div className="p-4 rounded-lg bg-accent/30 border border-white/10">
      <div className="text-2xl mb-2">{icon}</div>
      <div className="text-sm text-muted-foreground mb-1">{title}</div>
      <div className="font-semibold truncate">{value}</div>
      <div className="text-xs text-muted-foreground">{subtitle}</div>
    </div>
  );
}

function calculateAnalytics(pockets: PocketData[]): AnalyticsData {
  const totalPockets = pockets.length;
  const totalContent = pockets.reduce((sum, p) => sum + p.contentIds.length, 0);
  const averageContentPerPocket = totalPockets > 0 ? totalContent / totalPockets : 0;

  // Calculate most used tags
  const tagCounts = new Map<string, number>();
  pockets.forEach((pocket) => {
    pocket.tags.forEach((tag) => {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    });
  });
  const mostUsedTags = Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Calculate most used categories
  const categoryCounts = new Map<string, number>();
  pockets.forEach((pocket) => {
    const category = (pocket as any).category || "Uncategorized";
    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
  });
  const mostUsedCategories = Array.from(categoryCounts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Find largest pocket
  const largestPocket = pockets.length > 0
    ? pockets.reduce((max, p) => (p.contentIds.length > max.contentIds.length ? p : max))
    : null;

  // Find oldest and newest pockets
  const sortedByDate = [...pockets].sort((a, b) => a.createdAt - b.createdAt);
  const oldestPocket = sortedByDate[0] || null;
  const newestPocket = sortedByDate[sortedByDate.length - 1] || null;

  // Calculate recent activity (last 7 days)
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const activityByDay = new Map<string, number>();

  pockets.forEach((pocket) => {
    if (pocket.updatedAt >= sevenDaysAgo) {
      const date = new Date(pocket.updatedAt).toLocaleDateString();
      activityByDay.set(date, (activityByDay.get(date) || 0) + 1);
    }
  });

  const recentActivity = Array.from(activityByDay.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 7);

  return {
    totalPockets,
    totalContent,
    averageContentPerPocket,
    mostUsedTags,
    mostUsedCategories,
    recentActivity,
    largestPocket: largestPocket
      ? { name: largestPocket.name, count: largestPocket.contentIds.length }
      : null,
    oldestPocket: oldestPocket
      ? { name: oldestPocket.name, date: new Date(oldestPocket.createdAt).toLocaleDateString() }
      : null,
    newestPocket: newestPocket
      ? { name: newestPocket.name, date: new Date(newestPocket.createdAt).toLocaleDateString() }
      : null,
  };
}
