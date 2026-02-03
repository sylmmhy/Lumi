import { useState, useCallback, useEffect, useRef, useContext } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { supabase } from '../../lib/supabase';
import { AuthContext } from '../../context/AuthContextDefinition';
import {
  isHealthKitSupported,
  healthKitAsync,
} from '../../lib/healthKitBridge';

/**
 * HealthKit 元数据类型 - 直接存储 HealthKit 返回的 metadata 字典
 * key 为去掉 "HKMetadataKey" 前缀后的名称（如 "HeartRateMotionContext"）
 * value 类型由 HealthKit 决定（number, string, boolean 等）
 */
type HealthKitMetadata = Record<string, unknown>;

/**
 * 健康数据类型定义（与 Supabase health_data 表对应）
 */
interface HealthDataRecord {
  id: string;
  user_id: string;
  data_type: string;
  value: number | null;
  unit: string | null;
  sleep_stage: string | null;
  start_date: string;
  end_date: string;
  source_name: string | null;
  source_bundle_id: string | null;
  metadata: HealthKitMetadata | null;  // HealthKit 元数据
  created_at: string;
}

/**
 * HK 标识符到简化名称的映射
 * 数据库存储的是完整标识符（如 HKQuantityTypeIdentifierHeartRate）
 * UI 配置使用简化名称（如 heart_rate）
 */
const HK_IDENTIFIER_TO_KEY: Record<string, string> = {
  // 心脏
  'HKQuantityTypeIdentifierHeartRate': 'heart_rate',
  'HKQuantityTypeIdentifierRestingHeartRate': 'resting_heart_rate',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN': 'hrv',
  'HKQuantityTypeIdentifierWalkingHeartRateAverage': 'walking_heart_rate',
  // 活动
  'HKQuantityTypeIdentifierStepCount': 'steps',
  'HKQuantityTypeIdentifierDistanceWalkingRunning': 'distance',
  'HKQuantityTypeIdentifierActiveEnergyBurned': 'active_energy',
  'HKQuantityTypeIdentifierBasalEnergyBurned': 'basal_energy',
  'HKQuantityTypeIdentifierFlightsClimbed': 'flights_climbed',
  'HKQuantityTypeIdentifierAppleExerciseTime': 'exercise_time',
  'HKQuantityTypeIdentifierAppleStandTime': 'stand_time',
  // 睡眠
  'HKCategoryTypeIdentifierSleepAnalysis': 'sleep',
  // 身体
  'HKQuantityTypeIdentifierBodyMass': 'body_mass',
  'HKQuantityTypeIdentifierHeight': 'height',
  'HKQuantityTypeIdentifierBodyMassIndex': 'bmi',
  // 呼吸
  'HKQuantityTypeIdentifierOxygenSaturation': 'oxygen_saturation',
  'HKQuantityTypeIdentifierRespiratoryRate': 'respiratory_rate',
  // 其他
  'HKQuantityTypeIdentifierVO2Max': 'vo2_max',
  'HKQuantityTypeIdentifierBodyTemperature': 'body_temperature',
};

/**
 * 数据类型配置
 */
const DATA_TYPE_CONFIG: Record<string, {
  icon: string;
  iconBg: string;
  iconColor: string;
  labelKey: string;
  formatValue: (value: number | null, unit: string | null, stage: string | null) => string;
}> = {
  heart_rate: {
    icon: 'fa-heart-pulse',
    iconBg: 'bg-red-50',
    iconColor: 'text-red-500',
    labelKey: 'heartRate',
    formatValue: (v, u) => v !== null ? `${Math.round(v)} ${u || 'bpm'}` : '-',
  },
  resting_heart_rate: {
    icon: 'fa-heart',
    iconBg: 'bg-pink-50',
    iconColor: 'text-pink-500',
    labelKey: 'restingHeartRate',
    formatValue: (v, u) => v !== null ? `${Math.round(v)} ${u || 'bpm'}` : '-',
  },
  hrv: {
    icon: 'fa-wave-square',
    iconBg: 'bg-purple-50',
    iconColor: 'text-purple-500',
    labelKey: 'hrv',
    formatValue: (v, u) => v !== null ? `${Math.round(v)} ${u || 'ms'}` : '-',
  },
  sleep: {
    icon: 'fa-moon',
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-500',
    labelKey: 'sleep',
    formatValue: (v, _u, stage) => {
      if (v === null) return '-';
      const hours = Math.floor(v / 60);
      const mins = Math.round(v % 60);
      const stageText = stage ? ` (${stage})` : '';
      return `${hours}h ${mins}m${stageText}`;
    },
  },
  steps: {
    icon: 'fa-shoe-prints',
    iconBg: 'bg-green-50',
    iconColor: 'text-green-500',
    labelKey: 'steps',
    formatValue: (v) => v !== null ? v.toLocaleString() : '-',
  },
  distance: {
    icon: 'fa-route',
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-500',
    labelKey: 'distance',
    formatValue: (v, u) => {
      if (v === null) return '-';
      // 如果单位是米，转换为公里
      if (u === 'm' || !u) {
        return `${(v / 1000).toFixed(2)} km`;
      }
      return `${v.toFixed(2)} ${u}`;
    },
  },
  active_energy: {
    icon: 'fa-fire',
    iconBg: 'bg-orange-50',
    iconColor: 'text-orange-500',
    labelKey: 'activeEnergy',
    formatValue: (v, u) => v !== null ? `${Math.round(v)} ${u || 'kcal'}` : '-',
  },
  basal_energy: {
    icon: 'fa-battery-half',
    iconBg: 'bg-yellow-50',
    iconColor: 'text-yellow-600',
    labelKey: 'basalEnergy',
    formatValue: (v, u) => v !== null ? `${Math.round(v)} ${u || 'kcal'}` : '-',
  },
  walking_heart_rate: {
    icon: 'fa-person-walking',
    iconBg: 'bg-pink-50',
    iconColor: 'text-pink-500',
    labelKey: 'walkingHeartRate',
    formatValue: (v, u) => v !== null ? `${Math.round(v)} ${u || 'bpm'}` : '-',
  },
  flights_climbed: {
    icon: 'fa-stairs',
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-500',
    labelKey: 'flightsClimbed',
    formatValue: (v) => v !== null ? `${Math.round(v)} 层` : '-',
  },
  exercise_time: {
    icon: 'fa-stopwatch',
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-500',
    labelKey: 'exerciseTime',
    formatValue: (v) => v !== null ? `${Math.round(v)} 分钟` : '-',
  },
  stand_time: {
    icon: 'fa-person',
    iconBg: 'bg-teal-50',
    iconColor: 'text-teal-500',
    labelKey: 'standTime',
    formatValue: (v) => v !== null ? `${Math.round(v)} 分钟` : '-',
  },
  oxygen_saturation: {
    icon: 'fa-lungs',
    iconBg: 'bg-sky-50',
    iconColor: 'text-sky-500',
    labelKey: 'oxygenSaturation',
    formatValue: (v) => v !== null ? `${(v * 100).toFixed(1)}%` : '-',
  },
  respiratory_rate: {
    icon: 'fa-wind',
    iconBg: 'bg-slate-50',
    iconColor: 'text-slate-500',
    labelKey: 'respiratoryRate',
    formatValue: (v, u) => v !== null ? `${Math.round(v)} ${u || '次/分'}` : '-',
  },
  vo2_max: {
    icon: 'fa-chart-line',
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-500',
    labelKey: 'vo2Max',
    formatValue: (v, u) => v !== null ? `${v.toFixed(1)} ${u || 'mL/kg/min'}` : '-',
  },
  body_mass: {
    icon: 'fa-weight-scale',
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    labelKey: 'bodyMass',
    formatValue: (v, u) => v !== null ? `${v.toFixed(1)} ${u || 'kg'}` : '-',
  },
};

/**
 * 数据类型中文名称映射（用于数据展示）
 */
const DATA_TYPE_LABELS: Record<string, string> = {
  // HKQuantityType - 心脏
  heartRate: '心率',
  restingHeartRate: '静息心率',
  walkingHeartRateAverage: '步行平均心率',
  heartRateVariabilitySDNN: '心率变异性',
  heartRateRecoveryOneMinute: '心率恢复',
  atrialFibrillationBurden: '房颤负担',
  // 呼吸
  oxygenSaturation: '血氧饱和度',
  respiratoryRate: '呼吸频率',
  forcedExpiratoryVolume1: '用力呼气量',
  forcedVitalCapacity: '用力肺活量',
  peakExpiratoryFlowRate: '呼气峰流速',
  // 生命体征
  bodyTemperature: '体温',
  bloodPressureSystolic: '收缩压',
  bloodPressureDiastolic: '舒张压',
  bloodGlucose: '血糖',
  // 身体测量
  height: '身高',
  bodyMass: '体重',
  bodyMassIndex: 'BMI',
  leanBodyMass: '瘦体重',
  bodyFatPercentage: '体脂率',
  waistCircumference: '腰围',
  // 活动
  stepCount: '步数',
  distanceWalkingRunning: '步行/跑步距离',
  distanceCycling: '骑行距离',
  distanceWheelchair: '轮椅距离',
  distanceSwimming: '游泳距离',
  distanceDownhillSnowSports: '滑雪距离',
  basalEnergyBurned: '基础消耗',
  activeEnergyBurned: '活动消耗',
  flightsClimbed: '爬楼层数',
  appleExerciseTime: '锻炼时间',
  appleMoveTime: '活动时间',
  appleStandTime: '站立时间',
  vo2Max: '最大摄氧量',
  // 移动性
  walkingSpeed: '步行速度',
  walkingDoubleSupportPercentage: '双脚支撑百分比',
  walkingStepLength: '步长',
  walkingAsymmetryPercentage: '步态不对称性',
  sixMinuteWalkTestDistance: '6分钟步行距离',
  stairAscentSpeed: '上楼速度',
  stairDescentSpeed: '下楼速度',
  appleWalkingSteadiness: '步行稳定性',
  // 跑步
  runningStrideLength: '跑步步幅',
  runningVerticalOscillation: '垂直振幅',
  runningGroundContactTime: '触地时间',
  runningPower: '跑步功率',
  runningSpeed: '跑步速度',
  // 骑行
  cyclingSpeed: '骑行速度',
  cyclingPower: '骑行功率',
  cyclingCadence: '踏频',
  cyclingFunctionalThresholdPower: 'FTP',
  // 游泳
  swimmingStrokeCount: '划水次数',
  // 其他活动
  pushCount: '推动次数',
  numberOfTimesFallen: '跌倒次数',
  physicalEffort: '体力消耗',
  // 水下
  underwaterDepth: '水下深度',
  waterTemperature: '水温',
  // 环境
  environmentalAudioExposure: '环境音量',
  headphoneAudioExposure: '耳机音量',
  environmentalSoundReduction: '环境降噪',
  // UV
  uvExposure: '紫外线暴露',
  // 营养
  dietaryEnergyConsumed: '摄入能量',
  dietaryCarbohydrates: '碳水化合物',
  dietaryFiber: '膳食纤维',
  dietarySugar: '糖',
  dietaryFatTotal: '总脂肪',
  dietaryFatSaturated: '饱和脂肪',
  dietaryFatMonounsaturated: '单不饱和脂肪',
  dietaryFatPolyunsaturated: '多不饱和脂肪',
  dietaryCholesterol: '胆固醇',
  dietaryProtein: '蛋白质',
  dietarySodium: '钠',
  dietaryPotassium: '钾',
  dietaryCalcium: '钙',
  dietaryIron: '铁',
  dietaryVitaminA: '维生素A',
  dietaryVitaminC: '维生素C',
  dietaryVitaminD: '维生素D',
  dietaryVitaminE: '维生素E',
  dietaryVitaminK: '维生素K',
  dietaryVitaminB6: '维生素B6',
  dietaryVitaminB12: '维生素B12',
  dietaryThiamin: '硫胺素',
  dietaryRiboflavin: '核黄素',
  dietaryNiacin: '烟酸',
  dietaryFolate: '叶酸',
  dietaryBiotin: '生物素',
  dietaryPantothenicAcid: '泛酸',
  dietaryPhosphorus: '磷',
  dietaryMagnesium: '镁',
  dietaryZinc: '锌',
  dietarySelenium: '硒',
  dietaryCopper: '铜',
  dietaryManganese: '锰',
  dietaryChromium: '铬',
  dietaryMolybdenum: '钼',
  dietaryChloride: '氯',
  dietaryIodine: '碘',
  dietaryCaffeine: '咖啡因',
  dietaryWater: '水',
  // 其他
  electrodermalActivity: '皮肤电活动',
  inhalerUsage: '吸入器使用',
  insulinDelivery: '胰岛素输送',
  peripheralPerfusionIndex: '灌注指数',
  nikeFuel: 'Nike Fuel',
  timeInDaylight: '日光时间',

  // HKCategoryType - 睡眠
  sleepAnalysis: '睡眠',
  // 正念
  mindfulSession: '正念',
  // 活动
  appleStandHour: '站立小时',
  // 心脏事件
  highHeartRateEvent: '高心率事件',
  lowHeartRateEvent: '低心率事件',
  irregularHeartRhythmEvent: '心律不齐事件',
  lowCardioFitnessEvent: '低心肺适能事件',
  // 听力
  audioExposureEvent: '音量暴露事件',
  environmentalAudioExposureEvent: '环境音量事件',
  headphoneAudioExposureEvent: '耳机音量事件',
  // 移动性
  appleWalkingSteadinessEvent: '步行稳定性事件',
  // 生殖健康
  menstrualFlow: '月经',
  intermenstrualBleeding: '经间期出血',
  ovulationTestResult: '排卵测试',
  cervicalMucusQuality: '宫颈粘液',
  sexualActivity: '性活动',
  contraceptive: '避孕',
  pregnancy: '怀孕',
  pregnancyTestResult: '验孕结果',
  progesteroneTestResult: '黄体酮测试',
  lactation: '哺乳',
  // 症状
  abdominalCramps: '腹部痉挛',
  acne: '痤疮',
  appetiteChanges: '食欲变化',
  bladderIncontinence: '膀胱失禁',
  bloating: '腹胀',
  breastPain: '乳房疼痛',
  chestTightnessOrPain: '胸闷/胸痛',
  chills: '发冷',
  constipation: '便秘',
  coughing: '咳嗽',
  diarrhea: '腹泻',
  dizziness: '头晕',
  drySkin: '皮肤干燥',
  fainting: '晕厥',
  fatigue: '疲劳',
  fever: '发烧',
  generalizedBodyAche: '全身疼痛',
  hairLoss: '脱发',
  headache: '头痛',
  heartburn: '胃灼热',
  hotFlashes: '潮热',
  lossOfSmell: '嗅觉丧失',
  lossOfTaste: '味觉丧失',
  lowerBackPain: '腰痛',
  memoryLapse: '记忆力下降',
  moodChanges: '情绪变化',
  nausea: '恶心',
  nightSweats: '盗汗',
  pelvicPain: '盆腔痛',
  rapidPoundingOrFlutteringHeartbeat: '心悸',
  runnyNose: '流鼻涕',
  shortnessOfBreath: '呼吸急促',
  sinusCongestion: '鼻塞',
  skippedHeartbeat: '心跳漏拍',
  sleepChanges: '睡眠变化',
  soreThroat: '咽喉痛',
  vaginalDryness: '阴道干燥',
  vomiting: '呕吐',
  wheezing: '喘息',
  // 其他
  toothbrushingEvent: '刷牙',
  handwashingEvent: '洗手',

  // HKCharacteristicType
  biologicalSex: '生理性别',
  bloodType: '血型',
  dateOfBirth: '出生日期',
  fitzpatrickSkinType: '皮肤类型',
  wheelchairUse: '轮椅使用',
  activityMoveMode: '活动模式',

  // HKCorrelationType
  bloodPressure: '血压',
  food: '食物',

  // HKWorkoutType
  workout: '锻炼',

  // HKActivitySummaryType
  activitySummary: '活动摘要',

  // HKAudiogramSampleType
  audiogram: '听力图',

  // HKElectrocardiogramType
  electrocardiogram: '心电图',
};

/** 授权状态类型 */
type AuthorizationStatus = 'loading' | 'not_available' | 'prompt' | 'granted' | 'denied';

/**
 * HealthKitSection - 展示用户的 HealthKit 健康数据
 * 可折叠设计，展开时自动复制数据到剪贴板
 */
export function HealthKitSection() {
  const { t } = useTranslation();
  const auth = useContext(AuthContext);
  const userId = auth?.userId;
  const [isExpanded, setIsExpanded] = useState(false);
  const [healthData, setHealthData] = useState<HealthDataRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  // 追踪是否已经自动复制过（避免重复复制）
  const hasCopiedRef = useRef(false);

  // 授权状态
  const [authStatus, setAuthStatus] = useState<AuthorizationStatus>('loading');
  const [isRequestingAuth, setIsRequestingAuth] = useState(false);

  // 检查是否支持 HealthKit（仅 iOS）
  const isSupported = isHealthKitSupported();

  /**
   * 从 Supabase 获取健康数据
   */
  const fetchHealthData = useCallback(async () => {
    if (!userId || !supabase) return;

    setIsLoading(true);
    try {
      // 获取过去 7 天的数据
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data, error } = await supabase
        .from('health_data')
        .select('*')
        .eq('user_id', userId)
        .gte('start_date', sevenDaysAgo.toISOString())
        .order('start_date', { ascending: false });

      if (error) {
        console.error('[HealthKitSection] Error fetching health data:', error);
        return;
      }

      setHealthData(data || []);
      console.log('[HealthKitSection] Fetched', data?.length || 0, 'records');
    } catch (err) {
      console.error('[HealthKitSection] Error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  /**
   * 检查授权状态
   */
  const checkAuthorizationStatus = useCallback(async () => {
    if (!isSupported) {
      setAuthStatus('not_available');
      return;
    }

    try {
      const status = await healthKitAsync.getPermissionStatus();
      console.log('[HealthKitSection] Authorization status:', status);
      setAuthStatus(status);
    } catch (err) {
      console.error('[HealthKitSection] Error checking auth status:', err);
      setAuthStatus('not_available');
    }
  }, [isSupported]);

  /**
   * 请求 HealthKit 授权（独立按钮）
   */
  const handleRequestAuthorization = useCallback(async () => {
    if (!isSupported) return;

    setIsRequestingAuth(true);
    try {
      console.log('[HealthKitSection] Requesting authorization...');
      const granted = await healthKitAsync.requestPermission();
      console.log('[HealthKitSection] Authorization result:', granted);

      if (granted) {
        setAuthStatus('granted');
        // 授权成功后自动同步数据
        const result = await healthKitAsync.syncData(7);
        if (result.success) {
          setLastSyncTime(new Date());
          await fetchHealthData();
        }
      } else {
        // 用户拒绝或取消，重新检查状态
        await checkAuthorizationStatus();
      }
    } catch (err) {
      console.error('[HealthKitSection] Authorization error:', err);
      await checkAuthorizationStatus();
    } finally {
      setIsRequestingAuth(false);
    }
  }, [isSupported, checkAuthorizationStatus, fetchHealthData]);

  /**
   * 触发 HealthKit 同步
   * 如果未授权，先请求授权再同步
   */
  const handleSync = useCallback(async () => {
    if (!isSupported) return;

    setIsSyncing(true);
    try {
      // 先检查授权状态
      const permissionStatus = await healthKitAsync.getPermissionStatus();
      console.log('[HealthKitSection] Permission status:', permissionStatus);

      // 如果未授权或状态为 prompt，先请求授权
      if (permissionStatus !== 'granted') {
        console.log('[HealthKitSection] Requesting permission...');
        const granted = await healthKitAsync.requestPermission();
        if (!granted) {
          console.log('[HealthKitSection] Permission not granted');
          setIsSyncing(false);
          return;
        }
        // 授权成功，更新状态
        setAuthStatus('granted');
      }

      // 授权后同步数据
      const result = await healthKitAsync.syncData(7);
      console.log('[HealthKitSection] Sync result:', result);

      if (result.success) {
        setLastSyncTime(new Date());
        // 同步成功说明有读取权限，确保状态为 granted
        setAuthStatus('granted');
        // 同步完成后重新获取数据
        await fetchHealthData();
      }
    } catch (err) {
      console.error('[HealthKitSection] Sync error:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [isSupported, fetchHealthData]);

  /**
   * 将数据格式化为可复制的文本
   */
  const formatDataForCopy = useCallback((): string => {
    if (healthData.length === 0) {
      return 'No health data available';
    }

    // 按类型分组数据
    const groupedData: Record<string, HealthDataRecord[]> = {};
    healthData.forEach(record => {
      if (!groupedData[record.data_type]) {
        groupedData[record.data_type] = [];
      }
      groupedData[record.data_type].push(record);
    });

    // 构建文本
    const lines: string[] = ['=== HealthKit Data (Last 7 Days) ===', ''];

    Object.entries(groupedData).forEach(([type, records]) => {
      const config = DATA_TYPE_CONFIG[type];
      const label = config?.labelKey
        ? t(`profile.healthKit.dataTypes.${config.labelKey}`)
        : type;

      lines.push(`📊 ${label}:`);

      records.slice(0, 10).forEach(record => {
        const date = new Date(record.start_date).toLocaleString();
        const value = config
          ? config.formatValue(record.value, record.unit, record.sleep_stage)
          : `${record.value} ${record.unit || ''}`;

        // 添加元数据（如果有）
        const metadataStr = record.metadata && Object.keys(record.metadata).length > 0
          ? ` ${JSON.stringify(record.metadata)}`
          : '';

        lines.push(`  • ${date}: ${value}${metadataStr}`);
      });

      if (records.length > 10) {
        lines.push(`  ... and ${records.length - 10} more records`);
      }
      lines.push('');
    });

    return lines.join('\n');
  }, [healthData, t]);

  /**
   * 复制数据到剪贴板
   */
  const copyToClipboard = useCallback(async () => {
    const text = formatDataForCopy();
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
      console.log('[HealthKitSection] Data copied to clipboard');
    } catch (err) {
      console.error('[HealthKitSection] Failed to copy:', err);
    }
  }, [formatDataForCopy]);

  // 组件挂载时检查授权状态
  useEffect(() => {
    if (isSupported) {
      checkAuthorizationStatus();
    } else {
      setAuthStatus('not_available');
    }
  }, [isSupported, checkAuthorizationStatus]);

  // 展开时自动复制数据（只复制一次）
  useEffect(() => {
    if (isExpanded && healthData.length > 0 && !hasCopiedRef.current) {
      hasCopiedRef.current = true;
      copyToClipboard();
    }
    // 关闭面板时重置标志，下次展开可以再次复制
    if (!isExpanded) {
      hasCopiedRef.current = false;
    }
  }, [isExpanded, healthData.length, copyToClipboard]);

  // 展开时获取数据
  useEffect(() => {
    if (isExpanded && healthData.length === 0) {
      fetchHealthData();
    }
  }, [isExpanded, healthData.length, fetchHealthData]);

  // 非 iOS 设备不显示此组件
  if (!isSupported) {
    return null;
  }

  /**
   * 获取最新的各类型数据摘要
   */
  const getLatestSummary = (): Map<string, HealthDataRecord> => {
    const summary = new Map<string, HealthDataRecord>();
    healthData.forEach(record => {
      if (!summary.has(record.data_type)) {
        summary.set(record.data_type, record);
      }
    });
    return summary;
  };

  const latestSummary = getLatestSummary();
  const dataTypeCount = latestSummary.size;

  /**
   * 获取授权状态的显示信息
   */
  const getAuthStatusDisplay = () => {
    switch (authStatus) {
      case 'loading':
        return { icon: 'fa-spinner fa-spin', color: 'text-gray-400', bg: 'bg-gray-100', text: t('profile.healthKit.authStatus.checking') };
      case 'granted':
        return { icon: 'fa-circle-check', color: 'text-green-500', bg: 'bg-green-100', text: t('profile.healthKit.authStatus.granted') };
      case 'denied':
        return { icon: 'fa-circle-xmark', color: 'text-red-500', bg: 'bg-red-100', text: t('profile.healthKit.authStatus.denied') };
      case 'prompt':
        return { icon: 'fa-circle-question', color: 'text-amber-500', bg: 'bg-amber-100', text: t('profile.healthKit.authStatus.notAuthorized') };
      case 'not_available':
      default:
        return { icon: 'fa-circle-exclamation', color: 'text-gray-400', bg: 'bg-gray-100', text: t('profile.healthKit.authStatus.notAvailable') };
    }
  };

  const authStatusDisplay = getAuthStatusDisplay();

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4">
      {/* Main Row - Clickable to expand */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center">
            <i className="fa-solid fa-heart-pulse text-red-500"></i>
          </div>
          <div className="text-left">
            <p className="font-medium text-gray-800">{t('profile.healthKit.title')}</p>
            <p className="text-xs text-gray-400">{t('profile.healthKit.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Authorization Status Badge */}
          <span className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${authStatusDisplay.bg} ${authStatusDisplay.color}`}>
            <i className={`fa-solid ${authStatusDisplay.icon}`}></i>
            <span className="hidden sm:inline">{authStatusDisplay.text}</span>
          </span>
          {isLoading ? (
            <i className="fa-solid fa-spinner fa-spin text-gray-400"></i>
          ) : dataTypeCount > 0 ? (
            <span className="text-xs text-green-500 flex items-center gap-1">
              <i className="fa-solid fa-database"></i>
              {dataTypeCount}
            </span>
          ) : null}
          <i className={`fa-solid fa-chevron-right text-gray-300 text-sm transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}></i>
        </div>
      </button>

      {/* Expandable Content */}
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[1200px] opacity-100' : 'max-h-0 opacity-0'}`}>
        {/* Divider */}
        <div className="border-t border-gray-100"></div>

        {/* Authorization Status Section */}
        <div className="p-4 bg-gray-50 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 ${authStatusDisplay.bg} rounded-full flex items-center justify-center`}>
                <i className={`fa-solid ${authStatusDisplay.icon} ${authStatusDisplay.color}`}></i>
              </div>
              <div>
                <p className="font-medium text-gray-700 text-sm">{t('profile.healthKit.authStatus.title')}</p>
                <p className={`text-xs ${authStatusDisplay.color}`}>{authStatusDisplay.text}</p>
              </div>
            </div>

            {/* Authorization Button - Show when not granted */}
            {authStatus !== 'granted' && authStatus !== 'loading' && authStatus !== 'not_available' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRequestAuthorization();
                }}
                disabled={isRequestingAuth}
                className="px-4 py-2 bg-gradient-to-r from-red-500 to-pink-500 text-white text-sm font-medium rounded-xl hover:shadow-md active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isRequestingAuth ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin"></i>
                    {t('profile.healthKit.authorizing')}
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-shield-check"></i>
                    {t('profile.healthKit.authorize')}
                  </>
                )}
              </button>
            )}

            {/* Refresh Status Button - Show when already checked */}
            {authStatus !== 'loading' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  checkAuthorizationStatus();
                }}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-all"
                title={t('profile.healthKit.refreshStatus')}
              >
                <i className="fa-solid fa-arrows-rotate"></i>
              </button>
            )}
          </div>

          {/* Denied State - Guide user to Settings */}
          {authStatus === 'denied' && (
            <div className="mt-3 p-3 bg-red-50 rounded-xl">
              <p className="text-xs text-red-600">
                <i className="fa-solid fa-info-circle mr-1"></i>
                {t('profile.healthKit.authStatus.deniedHint')}
              </p>
            </div>
          )}

          {/* Prompt State - Explain what will happen */}
          {authStatus === 'prompt' && (
            <div className="mt-3 p-3 bg-amber-50 rounded-xl">
              <p className="text-xs text-amber-700">
                <i className="fa-solid fa-lightbulb mr-1"></i>
                {t('profile.healthKit.authStatus.promptHint')}
              </p>
            </div>
          )}
        </div>

        {/* Copy Success Banner */}
        {copySuccess && (
          <div className="px-4 py-2 bg-green-50 border-b border-green-100 flex items-center gap-2">
            <i className="fa-solid fa-clipboard-check text-green-500"></i>
            <span className="text-xs text-green-700">{t('profile.healthKit.copiedToClipboard')}</span>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="p-8 flex flex-col items-center justify-center">
            <i className="fa-solid fa-spinner fa-spin text-2xl text-gray-300 mb-2"></i>
            <p className="text-sm text-gray-400">{t('profile.healthKit.loading')}</p>
          </div>
        )}

        {/* No Data State */}
        {!isLoading && healthData.length === 0 && (
          <div className="p-8 flex flex-col items-center justify-center">
            <i className="fa-solid fa-heart-crack text-3xl text-gray-200 mb-3"></i>
            <p className="text-sm text-gray-500 mb-4">{t('profile.healthKit.noDataDesc')}</p>
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-xl hover:bg-red-600 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {isSyncing ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin"></i>
                  {t('profile.healthKit.syncing')}
                </>
              ) : (
                <>
                  <i className="fa-solid fa-sync"></i>
                  {t('profile.healthKit.syncNow')}
                </>
              )}
            </button>
          </div>
        )}

        {/* Data List */}
        {!isLoading && healthData.length > 0 && (
          <>
            {Array.from(latestSummary.entries()).map(([type, record], index) => {
              // 将 HK 标识符转换为简化键名
              const configKey = HK_IDENTIFIER_TO_KEY[type] || type;
              const config = DATA_TYPE_CONFIG[configKey] || {
                icon: 'fa-chart-simple',
                iconBg: 'bg-gray-50',
                iconColor: 'text-gray-500',
                labelKey: configKey,
                formatValue: (v: number | null, u: string | null) => `${v} ${u || ''}`,
              };

              // 尝试翻译，如果失败则使用 DATA_TYPE_LABELS 中的中文名
              const translationKey = `profile.healthKit.dataTypes.${config.labelKey}`;
              const translatedLabel = t(translationKey);
              const label = translatedLabel !== translationKey
                ? translatedLabel
                : (DATA_TYPE_LABELS[configKey] || DATA_TYPE_LABELS[type.replace(/^HK(Quantity|Category)TypeIdentifier/, '')] || type);
              const value = config.formatValue(record.value, record.unit, record.sleep_stage);
              const date = new Date(record.start_date);
              const dateStr = date.toLocaleDateString();

              return (
                <div
                  key={type}
                  className={`flex items-center justify-between p-4 pl-6 ${
                    index < latestSummary.size - 1 ? 'border-b border-gray-100' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 ${config.iconBg} rounded-full flex items-center justify-center`}>
                      <i className={`fa-solid ${config.icon} ${config.iconColor} text-sm`}></i>
                    </div>
                    <div>
                      <p className="font-medium text-gray-700 text-sm">{label}</p>
                      <p className="text-xs text-gray-400">{dateStr}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-800">{value}</p>
                  </div>
                </div>
              );
            })}

            {/* Sync Button */}
            <div className="p-4 border-t border-gray-100">
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-red-500 to-pink-500 text-white font-medium rounded-xl shadow-sm hover:shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
              >
                {isSyncing ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin"></i>
                    <span>{t('profile.healthKit.syncing')}</span>
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-sync"></i>
                    <span>{t('profile.healthKit.syncNow')}</span>
                  </>
                )}
              </button>
              {lastSyncTime && (
                <p className="text-xs text-gray-400 text-center mt-2">
                  {t('profile.healthKit.lastSync')}: {lastSyncTime.toLocaleTimeString()}
                </p>
              )}
            </div>

            {/* Copy Button */}
            <div className="p-4 pt-0">
              <button
                onClick={copyToClipboard}
                className="w-full py-2.5 px-4 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm"
              >
                <i className={`fa-solid ${copySuccess ? 'fa-check' : 'fa-copy'}`}></i>
                <span>{copySuccess ? t('profile.healthKit.copied') : t('profile.healthKit.copyData')}</span>
              </button>
            </div>
          </>
        )}

        {/* Privacy Note */}
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
          <div className="flex items-start gap-2">
            <i className="fa-solid fa-lock text-gray-400 mt-0.5 text-xs"></i>
            <p className="text-xs text-gray-500">
              {t('profile.healthKit.privacyNote')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
