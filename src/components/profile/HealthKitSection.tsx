import { useState, useCallback, useEffect, useRef, useContext } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { supabase } from '../../lib/supabase';
import { AuthContext } from '../../context/AuthContextDefinition';
import {
  isHealthKitSupported,
  healthKitAsync,
} from '../../lib/healthKitBridge';
import type { HealthKitAvailableTypes, HKObjectTypeClass } from '../../lib/healthKitBridge';

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
};

/**
 * HKObjectType 子类中文名称映射
 */
const HK_CLASS_LABELS: Record<HKObjectTypeClass, string> = {
  HKQuantityType: '数值型数据',
  HKCategoryType: '分类型数据',
  HKCharacteristicType: '特征数据',
  HKCorrelationType: '关联数据',
  HKWorkoutType: '锻炼数据',
  HKActivitySummaryType: '活动摘要',
  HKAudiogramSampleType: '听力图',
  HKElectrocardiogramType: '心电图',
};

/**
 * 数据类型中文名称映射（用于可用性检查展示）
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
  // 数据类型可用性状态（按 HKObjectType 子类分组）
  const [availableTypes, setAvailableTypes] = useState<HealthKitAvailableTypes | null>(null);
  const [isLoadingTypes, setIsLoadingTypes] = useState(false);
  const [typeCopySuccess, setTypeCopySuccess] = useState(false);
  const [expandedClasses, setExpandedClasses] = useState<Set<HKObjectTypeClass>>(new Set());

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
      }

      // 授权后同步数据
      const result = await healthKitAsync.syncData(7);
      console.log('[HealthKitSection] Sync result:', result);

      if (result.success) {
        setLastSyncTime(new Date());
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

  /**
   * 获取所有数据类型的可用性
   * 会先检查/请求权限，然后再查询数据
   */
  const handleGetAvailableTypes = useCallback(async () => {
    if (!isSupported) return;

    setIsLoadingTypes(true);
    try {
      // 先检查授权状态
      const permissionStatus = await healthKitAsync.getPermissionStatus();
      console.log('[HealthKitSection] Permission status for availability check:', permissionStatus);

      // 如果未授权，先请求授权
      if (permissionStatus !== 'granted') {
        console.log('[HealthKitSection] Requesting permission before checking availability...');
        const granted = await healthKitAsync.requestPermission();
        if (!granted) {
          console.log('[HealthKitSection] Permission not granted, cannot check availability');
          setIsLoadingTypes(false);
          return;
        }
      }

      // 授权后查询可用数据类型
      const types = await healthKitAsync.getAvailableTypes();
      setAvailableTypes(types);
      console.log('[HealthKitSection] Available types:', types);
    } catch (err) {
      console.error('[HealthKitSection] Error getting available types:', err);
    } finally {
      setIsLoadingTypes(false);
    }
  }, [isSupported]);

  /**
   * 切换类别展开/折叠状态
   */
  const toggleClassExpanded = useCallback((className: HKObjectTypeClass) => {
    setExpandedClasses(prev => {
      const newSet = new Set(prev);
      if (newSet.has(className)) {
        newSet.delete(className);
      } else {
        newSet.add(className);
      }
      return newSet;
    });
  }, []);

  /**
   * 格式化并复制数据类型可用性信息
   */
  const copyAvailabilityInfo = useCallback(async () => {
    if (!availableTypes) return;

    const lines: string[] = ['=== HealthKit 数据可用性（过去30天）===', ''];

    let totalAvailable = 0;
    let totalUnavailable = 0;

    // 按类别分组输出
    Object.entries(availableTypes).filter(([, types]) => types != null).forEach(([className, types]) => {
      const classLabel = HK_CLASS_LABELS[className as HKObjectTypeClass] || className;
      const available = Object.entries(types!).filter(([, count]) => count > 0);
      const unavailable = Object.entries(types!).filter(([, count]) => count === 0);

      totalAvailable += available.length;
      totalUnavailable += unavailable.length;

      lines.push(`📁 ${classLabel} (${className})`);
      lines.push(`   ✅ 可用: ${available.length} 种`);
      if (available.length > 0) {
        available.forEach(([type, count]) => {
          lines.push(`      - ${DATA_TYPE_LABELS[type] || type}: ${count} 条`);
        });
      }
      lines.push(`   ❌ 不可用: ${unavailable.length} 种`);
      if (unavailable.length > 0) {
        lines.push(`      ${unavailable.map(([type]) => DATA_TYPE_LABELS[type] || type).join(', ')}`);
      }
      lines.push('');
    });

    lines.push(`总计: ✅ ${totalAvailable} 种可用, ❌ ${totalUnavailable} 种不可用`);

    const text = lines.join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setTypeCopySuccess(true);
      setTimeout(() => setTypeCopySuccess(false), 2000);
      console.log('[HealthKitSection] Availability info copied to clipboard');
    } catch (err) {
      console.error('[HealthKitSection] Failed to copy availability info:', err);
    }
  }, [availableTypes]);

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
          {isLoading ? (
            <i className="fa-solid fa-spinner fa-spin text-gray-400"></i>
          ) : dataTypeCount > 0 ? (
            <span className="text-xs text-green-500 flex items-center gap-1">
              <i className="fa-solid fa-circle-check"></i>
              {dataTypeCount} {t('profile.healthKit.dataTypes')}
            </span>
          ) : (
            <span className="text-xs text-gray-400">
              {t('profile.healthKit.noData')}
            </span>
          )}
          <i className={`fa-solid fa-chevron-right text-gray-300 text-sm transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}></i>
        </div>
      </button>

      {/* Expandable Content */}
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
        {/* Divider */}
        <div className="border-t border-gray-100"></div>

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
              const config = DATA_TYPE_CONFIG[type] || {
                icon: 'fa-chart-simple',
                iconBg: 'bg-gray-50',
                iconColor: 'text-gray-500',
                labelKey: type,
                formatValue: (v: number | null, u: string | null) => `${v} ${u || ''}`,
              };

              const label = t(`profile.healthKit.dataTypes.${config.labelKey}`) || type;
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

        {/* Data Type Availability Section */}
        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-700">
              {t('profile.healthKit.dataTypeAvailability')}
            </span>
            <div className="flex gap-2">
              <button
                onClick={handleGetAvailableTypes}
                disabled={isLoadingTypes}
                className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 active:scale-95 transition-all disabled:opacity-50"
              >
                {isLoadingTypes ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin mr-1"></i>
                    {t('profile.healthKit.checking')}
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-magnifying-glass mr-1"></i>
                    {t('profile.healthKit.checkAvailability')}
                  </>
                )}
              </button>
              {availableTypes && (
                <button
                  onClick={copyAvailabilityInfo}
                  className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 active:scale-95 transition-all"
                >
                  <i className={`fa-solid ${typeCopySuccess ? 'fa-check' : 'fa-copy'} mr-1`}></i>
                  {typeCopySuccess ? t('profile.healthKit.copied') : t('profile.healthKit.copy')}
                </button>
              )}
            </div>
          </div>

          {/* Availability Results - Grouped by HKObjectType Class */}
          {availableTypes && (
            <div className="space-y-2">
              {/* Summary */}
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">
                    {t('profile.healthKit.totalTypes')}: {
                      Object.values(availableTypes).filter(Boolean).reduce((sum, types) => sum + Object.keys(types!).length, 0)
                    }
                  </span>
                  <div className="flex gap-3 text-xs">
                    <span className="text-green-600">
                      <i className="fa-solid fa-circle-check mr-1"></i>
                      {Object.values(availableTypes).filter(Boolean).reduce((sum, types) =>
                        sum + Object.values(types!).filter(c => c > 0).length, 0
                      )} {t('profile.healthKit.available')}
                    </span>
                    <span className="text-gray-400">
                      <i className="fa-solid fa-circle-xmark mr-1"></i>
                      {Object.values(availableTypes).filter(Boolean).reduce((sum, types) =>
                        sum + Object.values(types!).filter(c => c === 0).length, 0
                      )} {t('profile.healthKit.unavailable')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Grouped by Class */}
              {Object.entries(availableTypes).filter(([, types]) => types != null).map(([className, types]) => {
                const classKey = className as HKObjectTypeClass;
                const classLabel = HK_CLASS_LABELS[classKey] || className;
                const availableCount = Object.values(types!).filter(c => c > 0).length;
                const unavailableCount = Object.values(types!).filter(c => c === 0).length;
                const isExpanded = expandedClasses.has(classKey);

                return (
                  <div key={className} className="bg-gray-50 rounded-xl overflow-hidden">
                    {/* Class Header */}
                    <button
                      onClick={() => toggleClassExpanded(classKey)}
                      className="w-full flex items-center justify-between p-3 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <i className={`fa-solid fa-chevron-right text-gray-400 text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}></i>
                        <span className="text-sm font-medium text-gray-700">{classLabel}</span>
                        <span className="text-xs text-gray-400">({className})</span>
                      </div>
                      <div className="flex gap-2 text-xs">
                        <span className="text-green-600">{availableCount} ✓</span>
                        <span className="text-gray-400">{unavailableCount} ✗</span>
                      </div>
                    </button>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="px-3 pb-3 border-t border-gray-100">
                        {/* Available */}
                        {availableCount > 0 && (
                          <div className="mt-2">
                            <p className="text-xs text-green-600 mb-1">{t('profile.healthKit.available')}:</p>
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(types)
                                .filter(([, count]) => count > 0)
                                .map(([type, count]) => (
                                  <span
                                    key={type}
                                    className="inline-flex items-center px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full"
                                  >
                                    {DATA_TYPE_LABELS[type] || type}
                                    <span className="ml-1 text-green-500">({count})</span>
                                  </span>
                                ))}
                            </div>
                          </div>
                        )}
                        {/* Unavailable */}
                        {unavailableCount > 0 && (
                          <div className="mt-2">
                            <p className="text-xs text-gray-400 mb-1">{t('profile.healthKit.unavailable')}:</p>
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(types)
                                .filter(([, count]) => count === 0)
                                .map(([type]) => (
                                  <span
                                    key={type}
                                    className="inline-flex items-center px-2 py-0.5 bg-gray-200 text-gray-500 text-xs rounded-full"
                                  >
                                    {DATA_TYPE_LABELS[type] || type}
                                  </span>
                                ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

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
