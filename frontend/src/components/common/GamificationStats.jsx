import { Trophy, Zap, TrendingUp, Star, PartyPopper } from 'lucide-react';
import { Card, StatTile, SkeletonLine } from '../ui';

// Level progression escalates toward the brand accent — neutral at the bottom,
// burnt-orange primary at the top — so rank reads as a real ladder rather than
// an arbitrary spread of hues.
const LEVELS = [
  { min: 1000, level: 5, name: 'Sports Legend', tone: 'primary' },
  { min: 500, level: 4, name: 'Sports Master', tone: 'warning' },
  { min: 200, level: 3, name: 'Sports Expert', tone: 'secondary' },
  { min: 50, level: 2, name: 'Sports Enthusiast', tone: 'success' },
  { min: 0, level: 1, name: 'Beginner', tone: 'neutral' },
];

const getLevel = (points) => LEVELS.find((l) => points >= l.min) || LEVELS[LEVELS.length - 1];

const GamificationStats = ({ userStats, loading }) => {
  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} padding="md" className="space-y-3">
            <SkeletonLine width="w-20" />
            <SkeletonLine width="w-12" />
          </Card>
        ))}
      </div>
    );
  }

  if (!userStats) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Trophy size={48} className="mx-auto mb-4 opacity-50" />
        <p>No gamification stats available yet.</p>
        <p className="text-sm">Start booking to see your progress!</p>
      </div>
    );
  }

  const points = userStats.points || 0;
  const currentLevel = getLevel(points);
  const nextLevelPoints = [50, 200, 500, 1000, 2000][currentLevel.level - 1] || 2000;
  const progressPercentage = Math.min((points / nextLevelPoints) * 100, 100);
  const weeklyBookings = userStats.weekly_bookings;

  return (
    <div className="space-y-6">
      {/* Level & progress — solid dark panel, matching the dashboard header
          treatment rather than the old blue-to-purple gradient. */}
      <div className="bg-elevated text-foreground p-6 rounded-2xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-display text-2xl">Level {currentLevel.level}</h3>
            <p className="text-muted-foreground mt-0.5">{currentLevel.name}</p>
          </div>
          <div className="text-right">
            <p className="font-display text-3xl tabular-nums">{points}</p>
            <p className="text-sm text-muted-foreground">Points</p>
          </div>
        </div>

        <div className="w-full bg-foreground/15 rounded-full h-2.5 mb-2 overflow-hidden">
          <div
            className="bg-primary h-full rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {Math.max(0, nextLevelPoints - points)} points to next level
        </p>
      </div>

      {/* Stats grid — same StatTile convention as the dashboards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile tone="primary" icon={<Zap size={22} />} value={points} label="Total points" />
        <StatTile tone="success" icon={<TrendingUp size={22} />} value={currentLevel.level} label="Current level" />
        <StatTile tone="warning" icon={<Trophy size={22} />} value={userStats.badges_earned || 0} label="Badges earned" />
        <StatTile tone="secondary" icon={<Star size={22} />} value={userStats.total_achievements || 0} label="Achievements" />
      </div>

      {/* Weekly progress */}
      {weeklyBookings !== undefined && (
        <Card padding="md">
          <h4 className="text-lg font-display font-semibold mb-4 flex items-center text-foreground">
            <TrendingUp className="mr-2 text-primary" size={20} />
            This week&apos;s progress
          </h4>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Bookings this week</span>
              <span className="font-medium text-foreground tabular-nums">{weeklyBookings}/3</span>
            </div>
            <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min((weeklyBookings / 3) * 100, 100)}%` }}
              />
            </div>
            {weeklyBookings >= 3 && (
              <p className="text-success text-sm font-medium flex items-center gap-1.5">
                <PartyPopper size={16} />
                Weekly Warrior badge earned!
              </p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
};

export default GamificationStats;
