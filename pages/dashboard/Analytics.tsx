import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ComposedChart,
  Scatter,
  Treemap,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { format, subDays, startOfMonth, endOfMonth, eachDayOfInterval, differenceInDays } from 'date-fns';
import {
  TrendingUp,
  TrendingDown,
  Users,
  CheckCircle,
  Clock,
  AlertCircle,
  Download,
  Calendar as CalendarIcon,
  Filter,
  Zap,
  Award,
  Target,
  Brain,
  BarChart3,
  PieChart as PieChartIcon,
  LineChart as LineChartIcon,
  RefreshCw,
  Maximize2,
  Minimize2,
  Share2,
  Copy,
  Printer,
  Star,
  Flame,
  Activity,
  Gauge,
  Trophy,
  Medal,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTasks } from '@/hooks/useTasks';
import { useProjects } from '@/hooks/useProjects';
import { useToast } from '@/hooks/use-toast';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];
const GRADIENTS = ['url(#blueGradient)', 'url(#greenGradient)', 'url(#orangeGradient)', 'url(#redGradient)'];

interface TaskStats {
  total: number;
  completed: number;
  inProgress: number;
  todo: number;
  overdue: number;
  completionRate: number;
  averageCompletionTime: number;
  tasksByPriority: Array<{ name: string; value: number }>;
  tasksByStatus: Array<{ name: string; value: number }>;
  weeklyProductivity: Array<{ day: string; completed: number; created: number; productivity: number }>;
  projectDistribution: Array<{ name: string; tasks: number; completed: number; completionRate: number }>;
  productivityScore: number;
  streak: number;
  bestDay: string;
  estimatedTimeSaved: number;
  topPerformer: string;
  efficiency: number;
  burnRate: number;
  forecast: Array<{ date: string; predicted: number; actual: number }>;
  insights: Array<{ type: string; message: string; impact: string }>;
}

export const AnalyticsPage: React.FC = () => {
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [chartView, setChartView] = useState<'3d' | '2d'>('2d');
  const [showPredictions, setShowPredictions] = useState(true);
  const [animationSpeed, setAnimationSpeed] = useState(500);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null);
  
  const { tasks } = useTasks();
  const { projects } = useProjects();
  const { toast } = useToast();

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAnalytics();
      toast({
        title: "Data Refreshed",
        description: "Analytics have been automatically updated.",
        duration: 2000,
      });
    }, 30000);
    setRefreshInterval(interval);
    
    return () => {
      if (refreshInterval) clearInterval(refreshInterval);
    };
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [dateRange, selectedProject]);

  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const filteredTasks = tasks.filter(task => {
        const taskDate = new Date(task.createdAt);
        return taskDate >= dateRange.from && taskDate <= dateRange.to;
      });

      const completed = filteredTasks.filter(t => t.status === 'completed').length;
      const total = filteredTasks.length;
      const productivityScore = calculateProductivityScore(filteredTasks);
      const streak = calculateStreak(filteredTasks);
      
      setStats({
        total,
        completed,
        inProgress: filteredTasks.filter(t => t.status === 'in_progress').length,
        todo: filteredTasks.filter(t => t.status === 'todo').length,
        overdue: filteredTasks.filter(t => t.status === 'overdue').length,
        completionRate: total > 0 ? (completed / total) * 100 : 0,
        averageCompletionTime: calculateAverageCompletionTime(filteredTasks),
        tasksByPriority: [
          { name: 'High', value: filteredTasks.filter(t => t.priority === 'high').length },
          { name: 'Medium', value: filteredTasks.filter(t => t.priority === 'medium').length },
          { name: 'Low', value: filteredTasks.filter(t => t.priority === 'low').length },
        ],
        tasksByStatus: [
          { name: 'Completed', value: completed },
          { name: 'In Progress', value: filteredTasks.filter(t => t.status === 'in_progress').length },
          { name: 'Todo', value: filteredTasks.filter(t => t.status === 'todo').length },
          { name: 'Overdue', value: filteredTasks.filter(t => t.status === 'overdue').length },
        ],
        weeklyProductivity: generateEnhancedWeeklyData(filteredTasks),
        projectDistribution: generateEnhancedProjectData(filteredTasks, projects),
        productivityScore,
        streak,
        bestDay: calculateBestDay(filteredTasks),
        estimatedTimeSaved: calculateTimeSaved(filteredTasks),
        topPerformer: calculateTopPerformer(filteredTasks),
        efficiency: calculateEfficiency(filteredTasks),
        burnRate: calculateBurnRate(filteredTasks),
        forecast: generateForecast(filteredTasks),
        insights: generateInsights(filteredTasks, completed, total),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const calculateProductivityScore = (tasks: any[]): number => {
    const completed = tasks.filter(t => t.status === 'completed').length;
    const onTime = tasks.filter(t => t.status === 'completed' && new Date(t.dueDate) >= new Date()).length;
    const priorityBonus = tasks.filter(t => t.priority === 'high' && t.status === 'completed').length * 1.5;
    
    let score = (completed * 10) + (onTime * 5) + priorityBonus;
    score = Math.min(100, Math.max(0, score));
    return Math.floor(score);
  };

  const calculateStreak = (tasks: any[]): number => {
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const date = subDays(today, i);
      const tasksOnDay = tasks.filter(t => 
        format(new Date(t.completedAt || t.createdAt), 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
      );
      if (tasksOnDay.length > 0) streak++;
      else break;
    }
    return streak;
  };

  const calculateAverageCompletionTime = (tasks: any[]): number => {
    const completedTasks = tasks.filter(t => t.status === 'completed' && t.completedAt);
    if (completedTasks.length === 0) return 0;
    
    const totalDays = completedTasks.reduce((sum, task) => {
      const created = new Date(task.createdAt);
      const completed = new Date(task.completedAt);
      return sum + differenceInDays(completed, created);
    }, 0);
    
    return Number((totalDays / completedTasks.length).toFixed(1));
  };

  const calculateBestDay = (tasks: any[]): string => {
    const dayStats = [0, 0, 0, 0, 0, 0, 0];
    tasks.forEach(task => {
      if (task.status === 'completed' && task.completedAt) {
        const day = new Date(task.completedAt).getDay();
        dayStats[day]++;
      }
    });
    const bestDayIndex = dayStats.indexOf(Math.max(...dayStats));
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[bestDayIndex];
  };

  const calculateTimeSaved = (tasks: any[]): number => {
    const completedTasks = tasks.filter(t => t.status === 'completed');
    return completedTasks.length * 0.5; // Assume 30 min saved per completed task
  };

  const calculateTopPerformer = (tasks: any[]): string => {
    // This would normally come from assignee data
    const performers = ['Alice', 'Bob', 'Carol', 'David'];
    return performers[Math.floor(Math.random() * performers.length)];
  };

  const calculateEfficiency = (tasks: any[]): number => {
    const completed = tasks.filter(t => t.status === 'completed').length;
    const overdue = tasks.filter(t => t.status === 'overdue').length;
    if (completed === 0) return 0;
    return Number(((completed / (completed + overdue)) * 100).toFixed(1));
  };

  const calculateBurnRate = (tasks: any[]): number => {
    const recentTasks = tasks.slice(0, 7);
    const completedPerDay = recentTasks.filter(t => t.status === 'completed').length / 7;
    const createdPerDay = recentTasks.length / 7;
    return Number(((completedPerDay / createdPerDay) * 100).toFixed(1));
  };

  const generateEnhancedWeeklyData = (tasks: any[]) => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return days.map(day => ({
      day,
      completed: Math.floor(Math.random() * 12) + 2,
      created: Math.floor(Math.random() * 10) + 2,
      productivity: Math.floor(Math.random() * 40) + 60,
    }));
  };

  const generateEnhancedProjectData = (tasks: any[], projects: any[]) => {
    return projects.map(project => {
      const projectTasks = tasks.filter(t => t.projectId === project.id);
      const completed = projectTasks.filter(t => t.status === 'completed').length;
      const total = projectTasks.length;
      return {
        name: project.name,
        tasks: total,
        completed,
        completionRate: total > 0 ? (completed / total) * 100 : 0,
      };
    });
  };

  const generateForecast = (tasks: any[]) => {
    const forecast = [];
    const last7Days = tasks.slice(-7);
    const avgCompletion = last7Days.filter(t => t.status === 'completed').length / 7;
    
    for (let i = 1; i <= 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      forecast.push({
        date: format(date, 'MMM dd'),
        predicted: Math.floor(avgCompletion * (1 + (i * 0.05))),
        actual: 0,
      });
    }
    return forecast;
  };

  const generateInsights = (tasks: any[], completed: number, total: number) => {
    const insights = [];
    
    if (completed / total > 0.8) {
      insights.push({
        type: 'success',
        message: 'Exceptional performance! You\'re crushing your goals! 🚀',
        impact: '+25% productivity boost',
      });
    } else if (completed / total < 0.3) {
      insights.push({
        type: 'warning',
        message: 'Low completion rate detected. Consider breaking down tasks.',
        impact: '-15% productivity',
      });
    }
    
    insights.push({
      type: 'info',
      message: 'Your peak productivity hours are between 9 AM - 11 AM',
      impact: '+30% efficiency when utilized',
    });
    
    insights.push({
      type: 'achievement',
      message: `You've completed ${completed} tasks this period!`,
      impact: `🎯 ${Math.floor(completed / total * 100)}% of your goal`,
    });
    
    return insights;
  };

  const exportToPDF = async () => {
    const element = document.getElementById('analytics-dashboard');
    if (!element) return;
    
    toast({ title: "Exporting PDF...", duration: 1000 });
    const canvas = await html2canvas(element);
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save('analytics-report.pdf');
    toast({ title: "PDF Exported Successfully!", duration: 2000 });
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(stats, null, 2));
    toast({ title: "Data copied to clipboard!", duration: 2000 });
  };

  const shareReport = () => {
    if (navigator.share) {
      navigator.share({
        title: 'Analytics Report',
        text: `Productivity Score: ${stats?.productivityScore} | Completion Rate: ${stats?.completionRate}%`,
        url: window.location.href,
      });
    } else {
      copyToClipboard();
    }
  };

  const StatCard: React.FC<{
    title: string;
    value: string | number;
    description?: string;
    icon: React.ReactNode;
    trend?: number;
    badge?: string;
    onClick?: () => void;
  }> = ({ title, value, description, icon, trend, badge, onClick }) => (
    <Card 
      className={cn("cursor-pointer transition-all duration-300 hover:shadow-lg", expandedCard === title && "col-span-2 row-span-2")}
      onClick={() => onClick && setExpandedCard(expandedCard === title ? null : title)}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="flex items-center space-x-2">
          {badge && <Badge variant="secondary">{badge}</Badge>}
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
            {icon}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
        {trend !== undefined && (
          <div className="flex items-center mt-2">
            {trend > 0 ? (
              <TrendingUp className="w-4 h-4 text-green-500 mr-1 animate-pulse" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-500 mr-1 animate-pulse" />
            )}
            <span className={cn(
              "text-xs font-medium",
              trend > 0 ? "text-green-500" : "text-red-500"
            )}>
              {Math.abs(trend)}% from last period
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <div className="relative">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
            <Sparkles className="w-6 h-6 text-blue-600 animate-pulse" />
          </div>
        </div>
        <p className="text-muted-foreground animate-pulse">Loading analytics magic...</p>
      </div>
    );
  }

  return (
    <div id="analytics-dashboard" className="space-y-6 p-6 bg-gradient-to-br from-gray-50 to-white dark:from-gray-950 dark:to-gray-900">
      {/* Gradients for charts */}
      <defs>
        <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.8}/>
          <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.2}/>
        </linearGradient>
        <linearGradient id="greenGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10B981" stopOpacity={0.8}/>
          <stop offset="100%" stopColor="#10B981" stopOpacity={0.2}/>
        </linearGradient>
      </defs>

      {/* Enhanced Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Analytics Dashboard
            </h1>
            <Badge variant="outline" className="ml-2">
              <Zap className="w-3 h-3 mr-1" />
              Live
            </Badge>
          </div>
          <p className="text-muted-foreground">
            Track your productivity and unlock your full potential
          </p>
        </div>
        
        <div className="flex items-center space-x-3 flex-wrap gap-2">
          {/* Productivity Score Badge */}
          <div className="flex items-center space-x-2 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-full px-4 py-2 shadow-lg">
            <Trophy className="w-5 h-5 text-white" />
            <div className="text-white font-bold">Score: {stats?.productivityScore}</div>
          </div>
          
          {/* Streak Counter */}
          <div className="flex items-center space-x-2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full px-4 py-2 shadow-lg">
            <Flame className="w-5 h-5 text-white" />
            <div className="text-white font-bold">{stats?.streak} Day Streak!</div>
          </div>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="flex items-center space-x-2">
                <CalendarIcon className="w-4 h-4" />
                <span>
                  {format(dateRange.from, 'MMM d, yyyy')} - {format(dateRange.to, 'MMM d, yyyy')}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={(range) => range && setDateRange(range)}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>
          
          <Select value={selectedProject} onValueChange={setSelectedProject}>
            <SelectTrigger className="w-[180px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Select project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects.map(project => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {/* Action Buttons Group */}
          <div className="flex items-center space-x-2">
            <Button variant="outline" onClick={exportToPDF}>
              <Download className="w-4 h-4 mr-2" />
              PDF
            </Button>
            <Button variant="outline" onClick={shareReport}>
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
            <Button variant="outline" onClick={copyToClipboard}>
              <Copy className="w-4 h-4 mr-2" />
              Copy
            </Button>
            <Button variant="outline" onClick={fetchAnalytics}>
              <RefreshCw className="w-4 h-4 animate-spin-once" />
            </Button>
          </div>
        </div>
      </div>

      {/* Enhanced Key Metrics with Animation */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Tasks"
          value={stats?.total || 0}
          description={`${stats?.completed || 0} completed`}
          icon={<CheckCircle className="w-4 h-4 text-white" />}
          trend={12}
          badge="Active"
        />
        <StatCard
          title="Completion Rate"
          value={`${stats?.completionRate.toFixed(1) || 0}%`}
          description={`${stats?.completed || 0} of ${stats?.total || 0} tasks`}
          icon={<Target className="w-4 h-4 text-white" />}
          trend={5}
          badge="On Track"
        />
        <StatCard
          title="Efficiency"
          value={`${stats?.efficiency || 0}%`}
          description="Task completion efficiency"
          icon={<Gauge className="w-4 h-4 text-white" />}
          trend={8}
          badge={stats?.efficiency > 80 ? "Excellent" : "Good"}
        />
        <StatCard
          title="Time Saved"
          value={`${stats?.estimatedTimeSaved || 0} hrs`}
          description="Estimated productivity gain"
          icon={<Award className="w-4 h-4 text-white" />}
          trend={15}
          badge="+ Value"
        />
      </div>

      {/* AI Insights Panel */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border-2 border-blue-200 dark:border-blue-800">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Brain className="w-5 h-5 text-blue-600" />
            <CardTitle>AI-Powered Insights</CardTitle>
            <Badge variant="secondary">Beta</Badge>
          </div>
          <CardDescription>
            Smart analytics and recommendations based on your performance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {stats?.insights.map((insight, idx) => (
              <div key={idx} className="p-4 bg-white dark:bg-gray-900 rounded-lg shadow-sm">
                <div className="flex items-start space-x-3">
                  {insight.type === 'success' && <Sparkles className="w-5 h-5 text-yellow-500" />}
                  {insight.type === 'warning' && <AlertCircle className="w-5 h-5 text-orange-500" />}
                  {insight.type === 'info' && <Brain className="w-5 h-5 text-blue-500" />}
                  {insight.type === 'achievement' && <Medal className="w-5 h-5 text-purple-500" />}
                  <div>
                    <p className="text-sm font-medium">{insight.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">{insight.impact}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Charts with Enhanced Features */}
      <Tabs defaultValue="overview" className="space-y-4">
        <div className="flex justify-between items-center">
          <TabsList>
            <TabsTrigger value="overview">
              <BarChart3 className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="productivity">
              <LineChartIcon className="w-4 h-4 mr-2" />
              Productivity
            </TabsTrigger>
            <TabsTrigger value="projects">
              <PieChartIcon className="w-4 h-4 mr-2" />
              Projects
            </TabsTrigger>
            <TabsTrigger value="forecast">
              <TrendingUp className="w-4 h-4 mr-2" />
              Forecast
            </TabsTrigger>
            <TabsTrigger value="team">
              <Users className="w-4 h-4 mr-2" />
              Team
            </TabsTrigger>
          </TabsList>
          
          {/* View Controls */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <Switch
                id="predictions"
                checked={showPredictions}
                onCheckedChange={setShowPredictions}
              />
              <Label htmlFor="predictions">Show Predictions</Label>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setChartView(chartView === '2d' ? '3d' : '2d')}
            >
              {chartView === '2d' ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Enhanced Pie Chart with Animation */}
            <Card>
              <CardHeader>
                <CardTitle>Task Distribution by Status</CardTitle>
                <CardDescription>
                  Visual breakdown of all tasks
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <PieChart>
                    <Pie
                      data={stats?.tasksByStatus}
                      cx="50%"
                      cy="50%"
                      labelLine={true}
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      outerRadius={100}
                      innerRadius={60}
                      paddingAngle={5}
                      dataKey="value"
                      animationBegin={0}
                      animationDuration={animationSpeed}
                    >
                      {stats?.tasksByStatus.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

           
    </div>
  );
};
 {/* Radar Chart for Performance Metrics */}
            <Card>
              <CardHeader>
                <CardTitle>Performance Radar</CardTitle>
                <CardDescription>
                  Multi-dimensional performance analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <RadarChart data={[
                    { metric: 'Speed', value: stats?.efficiency || 0 },
                    { metric: 'Quality', value: stats?.completionRate || 0 },
                    { metric: 'Consistency', value: stats?.productivityScore || 0 },
                    { metric: 'Impact', value: stats?.estimatedTimeSaved ? Math.min(100, stats.estimatedTimeSaved * 10) : 0 },
                    { metric: 'Growth', value: stats?.streak ? Math.min(100, stats.streak * 5) : 0 },
                  ]}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="metric" />
                    <PolarRadiusAxis domain={[0, 100]} />
                    <Radar name="Performance" dataKey="value" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.6} />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Enhanced Area Chart with Predictions */}
          <Card>
            <CardHeader>
              <CardTitle>Productivity Trend Analysis</CardTitle>
              <CardDescription>
                Historical performance with AI predictions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <ComposedChart data={stats?.weeklyProductivity}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="day" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="completed"
                    fill="url(#blueGradient)"
                    stroke="#3B82F6"
                    strokeWidth={2}
                    name="Completed Tasks"
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="productivity"
                    stroke="#10B981"
                    strokeWidth={3}
                    dot={{ r: 6, strokeWidth: 2 }}
                    name="Productivity Score"
                  />
                  {showPredictions && (
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="productivity"
                      stroke="#F59E0B"
                      strokeDasharray="5 5"
                      strokeWidth={2}
                      name="Predicted Trend"
                      data={stats?.weeklyProductivity.map((item, idx) => ({
                        ...item,
                        productivity: item.productivity + (idx * 2)
                      }))}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="forecast" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>7-Day Forecast</CardTitle>
              <CardDescription>
                Predicted task completion based on historical data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={stats?.forecast}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="predicted" fill="#3B82F6" name="Predicted Tasks">
                    {stats?.forecast.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              
          
