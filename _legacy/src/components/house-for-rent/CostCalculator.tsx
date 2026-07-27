'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calculator, ChevronDown, Download, Zap, Droplets, Wifi, Car,
  Shield, Home, CalendarDays, TrendingUp, Repeat
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface CostCalculatorProps {
  rent: number;
  area?: number;
  bedrooms?: number;
  parkingIncluded?: boolean;
  furnished?: boolean;
}

const formatUGX = (amount: number) => {
  return `UGX ${Math.round(amount).toLocaleString('en-UG')}`;
};

// Color palette for chart segments (red-themed)
const CHART_COLORS = [
  'bg-red-500',    // Rent
  'bg-amber-500',      // Security Deposit
  'bg-cyan-500',       // Service Charge
  'bg-sky-500',        // Water
  'bg-yellow-500',     // Electricity
  'bg-purple-500',     // Internet
  'bg-rose-500',       // Parking
];

const PIE_COLORS = [
  '#ef4444', // red-500
  '#f59e0b', // amber-500
  '#06b6d4', // cyan-500
  '#0ea5e9', // sky-500
  '#eab308', // yellow-500
  '#a855f7', // purple-500
  '#f43f5e', // rose-500
];

export default function CostCalculator({
  rent,
  area = 50,
  bedrooms = 1,
  parkingIncluded = false,
  furnished = false,
}: CostCalculatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showYearly, setShowYearly] = useState(false);

  // Adjustable costs
  const [electricityUsage, setElectricityUsage] = useState(50); // kWh per month
  const [waterUsage, setWaterUsage] = useState(3); // cubic meters per month

  // Optional toggles
  const [includeParking, setIncludeParking] = useState(!parkingIncluded);
  const [includeInternet, setIncludeInternet] = useState(true);

  // Fixed costs
  const [serviceCharge, setServiceCharge] = useState(Math.round(rent * 0.08)); // 8% of rent

  // On mount, determine default open state based on screen width
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsOpen(true);
      }
    };
    handleResize();
  }, []);

  // Calculate individual costs
  const electricityCost = useMemo(() => Math.round(electricityUsage * 25), [electricityUsage]); // UGX 25 per kWh avg Uganda
  const waterCost = useMemo(() => Math.round(waterUsage * 120 + 500), [waterUsage]); // UGX 120 per m³ + fixed charge
  const internetCost = useMemo(() => includeInternet ? 150000 : 0, [includeInternet]); // UGX 150,000 avg internet in Uganda
  const parkingCost = useMemo(() => (includeParking && !parkingIncluded) ? 200000 : 0, [includeParking, parkingIncluded]); // UGX 200,000 avg parking
  const securityDeposit = rent; // 1 month rent

  const monthlyCosts = useMemo(() => [
    { label: 'Rent', value: rent, icon: Home, color: CHART_COLORS[0], pieColor: PIE_COLORS[0], always: true },
    { label: 'Service Charge', value: serviceCharge, icon: Shield, color: CHART_COLORS[2], pieColor: PIE_COLORS[2], always: true },
    { label: 'Water', value: waterCost, icon: Droplets, color: CHART_COLORS[3], pieColor: PIE_COLORS[3], always: true },
    { label: 'Electricity Est.', value: electricityCost, icon: Zap, color: CHART_COLORS[4], pieColor: PIE_COLORS[4], always: true },
    { label: 'Internet', value: internetCost, icon: Wifi, color: CHART_COLORS[5], pieColor: PIE_COLORS[5], always: false, enabled: includeInternet },
    { label: 'Parking', value: parkingCost, icon: Car, color: CHART_COLORS[6], pieColor: PIE_COLORS[6], always: false, enabled: includeParking && !parkingIncluded },
  ], [rent, serviceCharge, waterCost, electricityCost, internetCost, parkingCost, includeInternet, includeParking, parkingIncluded]);

  const totalMonthly = useMemo(() => {
    return monthlyCosts.reduce((sum, c) => sum + c.value, 0);
  }, [monthlyCosts]);

  const totalMoveIn = useMemo(() => {
    return totalMonthly + securityDeposit;
  }, [totalMonthly, securityDeposit]);

  const totalYearly = useMemo(() => {
    return totalMonthly * 12;
  }, [totalMonthly]);

  const maxValue = useMemo(() => {
    return Math.max(...monthlyCosts.filter(c => c.value > 0).map(c => c.value), 1);
  }, [monthlyCosts]);

  // Pie chart data (only non-zero values)
  const pieData = useMemo(() => {
    return monthlyCosts.filter(c => c.value > 0);
  }, [monthlyCosts]);

  // Conic gradient for pie chart
  const pieGradient = useMemo(() => {
    if (pieData.length === 0) return '';
    const total = pieData.reduce((s, c) => s + c.value, 0);
    if (total === 0) return '';
    let currentAngle = 0;
    const stops = pieData.map((c) => {
      const angle = (c.value / total) * 360;
      const start = currentAngle;
      const end = currentAngle + angle;
      currentAngle = end;
      return `${c.pieColor} ${start}deg ${end}deg`;
    });
    return `conic-gradient(${stops.join(', ')})`;
  }, [pieData]);

  const handleDownloadEstimate = useCallback(() => {
    const multiplier = showYearly ? 12 : 1;
    const period = showYearly ? 'Yearly' : 'Monthly';
    const lines = [
      '═══════════════════════════════════════',
      '       RENTAL COST ESTIMATE',
      '═══════════════════════════════════════',
      '',
      `Date: ${new Date().toLocaleDateString('en-UG', { year: 'numeric', month: 'long', day: 'numeric' })}`,
      '',
      `── ${period} Cost Breakdown ──`,
      '',
      ...monthlyCosts
        .filter(c => c.value > 0)
        .map(c => `${c.label.padEnd(20)} ${formatUGX(c.value * multiplier)}`),
      '',
      '───────────────────────────────────────',
      `${`${period} Total`.padEnd(20)} ${formatUGX(totalMonthly * multiplier)}`,
      '',
      '── One-Time Costs ──',
      '',
      `Security Deposit    ${formatUGX(securityDeposit)}`,
      '',
      '───────────────────────────────────────',
      `Total Move-In Cost  ${formatUGX(totalMoveIn)}`,
      '',
      '═══════════════════════════════════════',
      '  Generated by House For Rent',
      '  Prices are estimates and may vary',
      '═══════════════════════════════════════',
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rental-estimate-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Estimate downloaded successfully!');
  }, [monthlyCosts, totalMonthly, securityDeposit, totalMoveIn, showYearly]);

  return (
    <Card className="overflow-hidden border-red-200/50 dark:border-red-800/50">
      <CardHeader
        className="cursor-pointer select-none hover:bg-red-50/50 dark:hover:bg-red-950/20 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50">
              <Calculator className="h-4 w-4 text-red-600" />
            </div>
            Cost Calculator
          </div>
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </motion.div>
        </CardTitle>
      </CardHeader>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <CardContent className="space-y-5 pt-0">
              {/* Yearly Toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Repeat className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium cursor-pointer" onClick={() => setShowYearly(!showYearly)}>
                    Yearly Projection
                  </Label>
                </div>
                <Switch
                  checked={showYearly}
                  onCheckedChange={setShowYearly}
                  className="data-[state=checked]:bg-red-600"
                />
              </div>

              {/* Total Monthly/Yearly Cost - Prominent Display */}
              <motion.div
                className="rounded-xl bg-gradient-to-r from-red-600 to-cyan-600 p-4 text-white shadow-lg shadow-red-500/20"
                layout
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-red-100 text-sm font-medium">
                      {showYearly ? 'Yearly Total' : 'Monthly Total'}
                    </p>
                    <motion.p
                      key={totalMonthly * (showYearly ? 12 : 1)}
                      initial={{ scale: 1.05, opacity: 0.8 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.25, ease: 'easeOut' }}
                      className="text-2xl font-bold mt-1"
                    >
                      {formatUGX(totalMonthly * (showYearly ? 12 : 1))}
                      <span className="text-sm font-normal text-red-200 ml-1">
                        /{showYearly ? 'yr' : 'mo'}
                      </span>
                    </motion.p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20">
                    <TrendingUp className="h-6 w-6" />
                  </div>
                </div>
              </motion.div>

              {/* Move-In Cost */}
              <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-red-600 dark:text-red-400" />
                    <span className="text-sm font-semibold text-red-700 dark:text-red-400">
                      Total Move-In Cost
                    </span>
                  </div>
                  <motion.span
                    key={totalMoveIn}
                    initial={{ opacity: 0.7 }}
                    animate={{ opacity: 1 }}
                    className="text-sm font-bold text-red-600 dark:text-red-400"
                  >
                    {formatUGX(totalMoveIn)}
                  </motion.span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 ml-6">
                  Includes deposit (1 mo) + first {showYearly ? 'year' : 'month'} charges
                </p>
              </div>

              {/* 2-Column Layout on Desktop */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Left Column - Interactive Controls */}
                <div className="space-y-4">
                  {/* Electricity Slider */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-yellow-500" />
                        <Label className="text-sm font-medium">Electricity Usage</Label>
                      </div>
                      <span className="text-sm font-semibold text-red-600 dark:text-red-400">
                        {electricityUsage} kWh
                      </span>
                    </div>
                    <Slider
                      value={[electricityUsage]}
                      onValueChange={([v]) => setElectricityUsage(v)}
                      min={10}
                      max={300}
                      step={5}
                      className="[&_[data-slot=slider-range]]:bg-yellow-500 [&_[data-slot=slider-thumb]]:border-yellow-500"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>10 kWh</span>
                      <span className="font-medium text-yellow-600 dark:text-yellow-400">{formatUGX(electricityCost)}</span>
                      <span>300 kWh</span>
                    </div>
                  </div>

                  {/* Water Slider */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Droplets className="h-4 w-4 text-sky-500" />
                        <Label className="text-sm font-medium">Water Usage</Label>
                      </div>
                      <span className="text-sm font-semibold text-red-600 dark:text-red-400">
                        {waterUsage} m³
                      </span>
                    </div>
                    <Slider
                      value={[waterUsage]}
                      onValueChange={([v]) => setWaterUsage(v)}
                      min={1}
                      max={20}
                      step={1}
                      className="[&_[data-slot=slider-range]]:bg-sky-500 [&_[data-slot=slider-thumb]]:border-sky-500"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>1 m³</span>
                      <span className="font-medium text-sky-600 dark:text-sky-400">{formatUGX(waterCost)}</span>
                      <span>20 m³</span>
                    </div>
                  </div>

                  {/* Service Charge Slider */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-cyan-500" />
                        <Label className="text-sm font-medium">Service Charge</Label>
                      </div>
                      <span className="text-sm font-semibold text-red-600 dark:text-red-400">
                        {formatUGX(serviceCharge)}
                      </span>
                    </div>
                    <Slider
                      value={[serviceCharge]}
                      onValueChange={([v]) => setServiceCharge(v)}
                      min={0}
                      max={Math.round(rent * 0.2)}
                      step={100}
                      className="[&_[data-slot=slider-range]]:bg-cyan-500 [&_[data-slot=slider-thumb]]:border-cyan-500"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>UGX 0</span>
                      <span>{formatUGX(Math.round(rent * 0.2))}</span>
                    </div>
                  </div>

                  {/* Toggle Switches */}
                  <div className="space-y-3 pt-1">
                    {/* Internet Toggle */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Wifi className="h-4 w-4 text-purple-500" />
                        <Label className="text-sm font-medium cursor-pointer" onClick={() => setIncludeInternet(!includeInternet)}>
                          Internet (UGX 150,000)
                        </Label>
                      </div>
                      <Switch
                        checked={includeInternet}
                        onCheckedChange={setIncludeInternet}
                        className="data-[state=checked]:bg-purple-500"
                      />
                    </div>

                    {/* Parking Toggle */}
                    {!parkingIncluded && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Car className="h-4 w-4 text-rose-500" />
                          <Label className="text-sm font-medium cursor-pointer" onClick={() => setIncludeParking(!includeParking)}>
                            Parking (UGX 200,000)
                          </Label>
                        </div>
                        <Switch
                          checked={includeParking}
                          onCheckedChange={setIncludeParking}
                          className="data-[state=checked]:bg-rose-500"
                        />
                      </div>
                    )}

                    {parkingIncluded && (
                      <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                        <Car className="h-4 w-4" />
                        <span className="font-medium">Parking included in rent</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column - Visualizations */}
                <div className="space-y-4">
                  {/* Bar Chart Breakdown */}
                  <div className="space-y-2.5">
                    <h4 className="text-sm font-semibold text-muted-foreground">
                      {showYearly ? 'Yearly' : 'Monthly'} Breakdown
                    </h4>
                    <div className="space-y-2">
                      {monthlyCosts.filter(c => c.value > 0).map((cost, i) => {
                        const Icon = cost.icon;
                        const displayValue = showYearly ? cost.value * 12 : cost.value;
                        const barWidth = (cost.value / maxValue) * 100;
                        return (
                          <div key={cost.label} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-1.5">
                                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-muted-foreground">{cost.label}</span>
                              </div>
                              <motion.span
                                key={displayValue}
                                initial={{ opacity: 0.6 }}
                                animate={{ opacity: 1 }}
                                className="font-semibold"
                              >
                                {formatUGX(displayValue)}
                              </motion.span>
                            </div>
                            <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.max(barWidth, 2)}%` }}
                                transition={{ duration: 0.5, delay: i * 0.08, ease: 'easeOut' }}
                                className={`h-full rounded-full ${cost.color}`}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Pie Chart Visualization */}
                  <div className="space-y-2.5">
                    <h4 className="text-sm font-semibold text-muted-foreground">
                      Cost Distribution
                    </h4>
                    <div className="flex items-center gap-4">
                      {/* CSS Pie Chart */}
                      <div className="relative shrink-0">
                        <div
                          className="h-28 w-28 rounded-full shadow-inner"
                          style={{ background: pieGradient }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="h-14 w-14 rounded-full bg-card shadow-sm flex items-center justify-center">
                            <span className="text-[10px] font-bold text-red-600 dark:text-red-400 text-center leading-tight">
                              {showYearly ? 'yr' : 'mo'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Legend */}
                      <div className="flex flex-col gap-1.5 min-w-0">
                        {pieData.map((cost) => {
                          const pct = totalMonthly > 0 ? ((cost.value / totalMonthly) * 100).toFixed(0) : '0';
                          return (
                            <div key={cost.label} className="flex items-center gap-1.5 text-xs min-w-0">
                              <div
                                className="h-2.5 w-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: cost.pieColor }}
                              />
                              <span className="text-muted-foreground truncate">{cost.label}</span>
                              <span className="font-medium ml-auto shrink-0">{pct}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* One-Time Costs Section */}
              <div className="rounded-lg border border-dashed border-red-300 dark:border-red-700 bg-red-50/30 dark:bg-red-950/10 p-3">
                <h4 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-2">
                  One-Time Costs
                </h4>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Security Deposit (1 month)
                  </span>
                  <span className="text-sm font-semibold">
                    {formatUGX(securityDeposit)}
                  </span>
                </div>
              </div>

              {/* Download Estimate Button */}
              <Button
                variant="outline"
                className="w-full gap-2 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
                onClick={handleDownloadEstimate}
              >
                <Download className="h-4 w-4" />
                Download Estimate
              </Button>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
