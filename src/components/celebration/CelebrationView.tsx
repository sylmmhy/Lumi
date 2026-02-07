// 导入动画样式
import '../effects/effects.css';
import { ConfettiEffect } from '../effects';
import { VerificationBadge } from './VerificationBadge';

/**
 * CelebrationView - 可复用的庆祝/结果视图组件
 * 
 * 功能：
 * - 成功庆祝页面（彩纸、金币、进度条动画）
 * - 失败鼓励页面
 * - 确认页面（询问用户是否完成）
 * - 所有内容可自定义
 */

export type CelebrationFlow = 'confirm' | 'success' | 'failure';
export type SuccessScene = 1 | 2 | 3 | 4 | 5;

export interface CelebrationViewProps {
  /** 当前流程：confirm（确认）、success（成功）、failure（失败） */
  flow: CelebrationFlow;

  /** 切换流程的回调 */
  onFlowChange?: (flow: CelebrationFlow) => void;

  /** 成功页面配置 */
  success?: {
    /** 当前动画场景 (1-5) */
    scene: SuccessScene;
    /** 金币数量 */
    coins: number;
    /** 进度条百分比 */
    progressPercent: number;
    /** 是否显示彩纸 */
    showConfetti: boolean;
    /** 完成时间（秒） */
    completionTime: number;
    /** 任务描述 */
    taskDescription: string;
    /** 等级显示文字 */
    levelText?: string;
    /** CTA 按钮配置 */
    ctaButton: {
      label: string;
      onClick: () => void;
    };
  };

  /** 失败页面配置 */
  failure?: {
    /** 标题 */
    title?: string;
    /** 副标题 */
    subtitle?: string;
    /** 按钮配置 */
    button: {
      label: string;
      onClick: () => void;
    };
  };

  /** 确认页面配置 */
  confirm?: {
    /** 标题 */
    title?: string;
    /** 副标题 */
    subtitle?: string;
    /** 确认按钮（是）*/
    yesButton: {
      label: string;
      onClick: () => void;
    };
    /** 否认按钮（否）*/
    noButton: {
      label: string;
      onClick: () => void;
    };
  };

  /** 视觉验证状态（可选） */
  verification?: {
    isVerifying: boolean;
    result: {
      verified: boolean;
      confidence: number;
      coins_awarded: number;
      not_visually_verifiable: boolean;
    } | null;
  };

  /** 背景颜色 */
  backgroundColor?: string;
}

/**
 * 格式化时间为 M:SS 格式
 */
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * 庆祝图标 SVG
 */
const CelebrationIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="119" height="119" viewBox="0 0 119 119" fill="none">
    <g clipPath="url(#clip0_910_5485)">
      <mask id="mask0_910_5485" style={{ maskType: 'luminance' }} maskUnits="userSpaceOnUse" x="0" y="0" width="119" height="119">
        <path d="M119 0H0V119H119V0Z" fill="white" />
      </mask>
      <g mask="url(#mask0_910_5485)">
        <mask id="mask1_910_5485" style={{ maskType: 'luminance' }} maskUnits="userSpaceOnUse" x="0" y="0" width="119" height="119">
          <path d="M119 0H0V119H119V0Z" fill="white" />
        </mask>
        <g mask="url(#mask1_910_5485)">
          <mask id="mask2_910_5485" style={{ maskType: 'alpha' }} maskUnits="userSpaceOnUse" x="-9" y="11" width="130" height="101">
            <path d="M120.382 11.9H-8.9248V111.067H120.382V11.9Z" fill="white" />
          </mask>
          <g mask="url(#mask2_910_5485)">
            <path d="M24.0977 109.023L64.505 89.2969C66.4304 88.3568 67.2292 86.0343 66.2891 84.1091C66.0109 83.5388 65.5968 83.0456 65.0833 82.6725L25.4069 53.846C23.6737 52.5866 21.2478 52.9707 19.9885 54.7039C19.6155 55.2174 19.3741 55.8145 19.2855 56.4428L13.0117 100.968C12.4138 105.211 15.3687 109.135 19.6117 109.733C21.1444 109.949 22.7067 109.702 24.0977 109.023Z" fill="url(#paint0_linear_910_5485)" />
            <mask id="mask3_910_5485" style={{ maskType: 'alpha' }} maskUnits="userSpaceOnUse" x="12" y="53" width="55" height="57">
              <path d="M24.0977 109.023L64.505 89.2969C66.4304 88.3568 67.2292 86.0343 66.2891 84.1091C66.0109 83.5388 65.5968 83.0456 65.0833 82.6725L25.4069 53.846C23.6737 52.5866 21.2478 52.9707 19.9885 54.7039C19.6155 55.2174 19.3741 55.8145 19.2855 56.4428L13.0117 100.968C12.4138 105.211 15.3687 109.135 19.6117 109.733C21.1444 109.949 22.7067 109.702 24.0977 109.023Z" fill="url(#paint1_linear_910_5485)" />
            </mask>
            <g mask="url(#mask3_910_5485)">
              <path d="M16.0972 48.5876L7.51245 50.2816L20.222 114.693L28.8067 112.999L16.0972 48.5876Z" fill="#FFC700" />
              <path d="M32.6253 45.2822L24.0405 46.9761L36.75 111.388L45.3348 109.694L32.6253 45.2822Z" fill="#FFC700" />
              <path d="M49.1524 45.2822L40.5676 46.9761L53.2771 111.388L61.8619 109.694L49.1524 45.2822Z" fill="#FFC700" />
            </g>
            <path d="M75.1784 20.425C75.1784 20.425 81.9326 26.3338 77.8711 30.8653C73.8096 35.3969 66.8407 27.0128 63.0925 32.5825C59.344 38.152 71.6864 45.12 67.6481 50.4251C63.6096 55.7304 55.7669 47.7452 52.4765 52.576C49.1862 57.4068 55.6211 61.8401 55.6211 61.8401" stroke="#CA94FF" strokeWidth="6.46533" strokeLinecap="round" />
            <path d="M110.094 72.7973C99.6676 59.1013 80.0487 60.1009 71.1255 74.7364" stroke="#14D4F4" strokeWidth="6.46533" strokeLinecap="round" />
            <path d="M24.2976 15.0406C39.121 18.4921 43.7207 36.2679 36.9299 49.7102" stroke="#FF82BD" strokeWidth="6.46533" strokeLinecap="round" />
            <path d="M92.9639 35.3941L86.4573 39.6198C85.2593 40.3975 84.9189 41.9992 85.6969 43.1973L89.9223 49.7039C90.7002 50.9016 92.302 51.2423 93.4997 50.4643L100.007 46.2389C101.204 45.4609 101.545 43.8592 100.767 42.6615L96.5414 36.1546C95.7634 34.9568 94.162 34.6162 92.9639 35.3941Z" fill="#FF82BD" />
            <path d="M114.463 49.6691L110.612 49.1964C109.195 49.0224 107.905 50.0306 107.731 51.4482L107.258 55.2984C107.084 56.716 108.092 58.0063 109.509 58.1803L113.36 58.653C114.777 58.8274 116.068 57.8192 116.242 56.4016L116.714 52.5513C116.888 51.1334 115.881 49.8432 114.463 49.6691Z" fill="#CA94FF" />
            <path d="M20.9257 29.6919L15.9794 28.1797C14.6135 27.7621 13.1678 28.5309 12.7502 29.8967L11.238 34.8429C10.8204 36.2087 11.5891 37.6546 12.955 38.0723L17.9012 39.5845C19.2671 40.0022 20.7129 39.2334 21.1305 37.8676L22.6427 32.9211C23.0603 31.5552 22.2916 30.1094 20.9257 29.6919Z" fill="#CA94FF" />
            <path d="M9.89624 56.1437L6.53676 54.204C5.29984 53.49 3.71818 53.9136 3.00403 55.1506L1.06444 58.51C0.350297 59.747 0.7741 61.3285 2.01103 62.0428L5.37053 63.9825C6.60744 64.6965 8.1891 64.2728 8.90325 63.0358L10.8428 59.6762C11.557 58.4395 11.1332 56.8577 9.89624 56.1437Z" fill="#FF82BD" />
            <path d="M91.8825 83.7783L88.1727 82.6439C86.8068 82.2265 85.3613 82.9953 84.9436 84.3611L83.8095 88.0709C83.3918 89.4368 84.1606 90.8823 85.5264 91.3L89.2362 92.4341C90.6021 92.8518 92.0479 92.083 92.4653 90.7172L93.5997 87.0074C94.0171 85.6415 93.2483 84.1957 91.8825 83.7783Z" fill="#FFC300" />
            <path d="M104.126 17.1507L100.67 15.3895C99.3969 14.7411 97.8398 15.2471 97.1912 16.5197L95.43 19.9761C94.7818 21.2487 95.2878 22.806 96.5602 23.4545L100.017 25.2156C101.289 25.864 102.847 25.358 103.495 24.0854L105.256 20.629C105.905 19.3564 105.399 17.7991 104.126 17.1507Z" fill="#FFC300" />
            <path d="M56.896 16.7909L53.9246 14.2974C52.8304 13.3793 51.1992 13.522 50.2811 14.6161L47.7874 17.5877C46.8693 18.6819 47.0121 20.3131 48.1064 21.2312L51.0781 23.7247C52.172 24.6428 53.8032 24.5001 54.7213 23.4059L57.2149 20.4343C58.133 19.3402 57.9902 17.7089 56.896 16.7909Z" fill="#14D4F4" />
            <path d="M23.2664 52.5345L65.1062 86.0063" stroke="#E0AF00" strokeWidth="9.91666" strokeLinecap="round" />
          </g>
        </g>
      </g>
    </g>
    <defs>
      <linearGradient id="paint0_linear_910_5485" x1="39.1101" y1="125.023" x2="32.4904" y2="50.6559" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FFE600" />
        <stop offset="1" stopColor="#FFD300" />
      </linearGradient>
      <linearGradient id="paint1_linear_910_5485" x1="39.1101" y1="125.023" x2="32.4904" y2="50.6559" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FFE600" />
        <stop offset="1" stopColor="#FFD300" />
      </linearGradient>
      <clipPath id="clip0_910_5485">
        <rect width="119" height="119" fill="white" />
      </clipPath>
    </defs>
  </svg>
);

/**
 * 失败页面的火焰图标
 */
const FailureFireIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="106" height="128" viewBox="0 0 106 128" fill="none">
    <path fillRule="evenodd" clipRule="evenodd" d="M59.2315 12.3399C56.0473 8.32518 49.9527 8.32518 46.7685 12.3399L30.7887 32.4859L20.4945 26.9757C19.5611 26.476 17.4777 25.8483 16.4921 25.6822C11.5467 24.8488 8.65374 28.7683 8.66853 34.0814L8.76889 70.1949C8.57805 71.8065 8.47998 73.4453 8.47998 75.1061C8.47998 98.7831 28.4123 117.977 53 117.977C77.5877 117.977 97.52 98.7831 97.52 75.1061C97.52 65.0916 93.9546 55.8794 87.9791 48.5824L59.2315 12.3399ZM49.6919 55.9205C51.2569 53.7891 54.4412 53.7891 56.0061 55.9205L66.7054 70.4896C70.0325 73.7964 72.08 78.3039 72.08 83.2719C72.08 93.4195 63.5377 101.646 53 101.646C42.4623 101.646 33.92 93.4195 33.92 83.2719C33.92 78.8712 35.5266 74.8318 38.206 71.6683C38.2668 71.5153 38.349 71.3656 38.454 71.2227L49.6919 55.9205Z" fill="#363535" />
  </svg>
);

export function CelebrationView({
  flow,
  success,
  failure,
  confirm,
  verification,
  backgroundColor = '#1e1e1e',
}: CelebrationViewProps) {
  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ backgroundColor }}>
      {/* 确认页面 */}
      {flow === 'confirm' && confirm && (
        <div className="flex flex-col items-center gap-8 px-6 max-w-md">
          {/* 时钟图标 */}
          <div className="text-9xl">⏰</div>

          {/* 标题 */}
          <div className="flex flex-col items-center gap-2">
            <h1
              className="text-center capitalize"
              style={{
                fontFamily: 'Sansita, sans-serif',
                fontSize: '32px',
                fontWeight: 400,
                lineHeight: '1.2',
                color: '#ffc92a'
              }}
            >
              {confirm.title || "Time's Up!"}
            </h1>
            <p
              className="text-center"
              style={{
                fontFamily: 'Inter, sans-serif',
                fontSize: '18px',
                fontWeight: 600,
                lineHeight: '1.4',
                color: '#ffffff'
              }}
            >
              {confirm.subtitle || 'Did you start your task?'}
            </p>
          </div>

          {/* 按钮 */}
          <div className="flex flex-col gap-4 w-full">
            {/* 是 按钮 */}
            <button
              onClick={confirm.yesButton.onClick}
              className="w-full h-[56px] bg-gradient-to-t from-[#ffd039] to-[#feb827] border border-[#ffe28a] rounded-[16px] flex items-center justify-center"
              style={{ boxShadow: '0 6px 0 0 #D34A22' }}
            >
              <span
                className="font-bold uppercase"
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '15px',
                  letterSpacing: '0.8px',
                  color: '#000000'
                }}
              >
                {confirm.yesButton.label}
              </span>
            </button>

            {/* 否 按钮 */}
            <button
              onClick={confirm.noButton.onClick}
              className="w-full h-[56px] bg-[#2c3039] border border-[#5a5c62] rounded-[16px] flex items-center justify-center"
              style={{ boxShadow: '0 4px 0 0 #444A58' }}
            >
              <span
                className="font-bold uppercase"
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '15px',
                  letterSpacing: '0.8px',
                  color: '#ffffff'
                }}
              >
                {confirm.noButton.label}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* 成功页面 */}
      {flow === 'success' && success && (
        <div className="fixed inset-0" style={{ backgroundColor }}>
          <div className="relative flex flex-col items-center justify-center h-full px-6">
            <div className="flex flex-col items-center gap-8 w-full max-w-md">
              {/* 庆祝图标 */}
              <CelebrationIcon />

              {/* 标题 */}
              <h1
                className="text-center"
                style={{
                  fontFamily: 'Sansita, sans-serif',
                  fontSize: '44.017px',
                  fontWeight: 400,
                  fontStyle: 'normal',
                  lineHeight: '60.946px',
                  color: '#FFC92A',
                  textTransform: 'capitalize'
                }}
              >
                You Made It!
              </h1>

              {/* 时间徽章 */}
              <div
                className="flex items-center justify-center"
                style={{
                  width: '123px',
                  height: '47px',
                  padding: '5.727px',
                  gap: '5.727px',
                  borderRadius: '12.885px',
                  border: '2.5px solid #FFC92A',
                  backgroundColor: '#2E2B28'
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <g clipPath="url(#clip0_910_5479)">
                    <path d="M14.5 19L16.5 21L21 16.5M21.9851 12.5499C21.995 12.3678 22 12.1845 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.4354 6.33651 21.858 11.7385 21.9966M12 6V12L15.7384 13.8692" stroke="#FFC92A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </g>
                  <defs>
                    <clipPath id="clip0_910_5479">
                      <rect width="24" height="24" fill="white" />
                    </clipPath>
                  </defs>
                </svg>
                <span
                  style={{
                    fontFamily: 'Sansita, sans-serif',
                    fontSize: '25px',
                    fontStyle: 'normal',
                    fontWeight: 400,
                    lineHeight: '16.464px',
                    letterSpacing: '-0.125px',
                    color: '#FFC92A',
                    textAlign: 'center'
                  }}
                >
                  {formatTime(success.completionTime)}
                </span>
              </div>

              {/* 已完成任务 */}
              <div
                className="flex items-center"
                style={{
                  width: '323px',
                  padding: '12px 34px 12px 16px',
                  gap: '13px',
                  borderRadius: '16px',
                  backgroundColor: '#2E2B28'
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24.63" height="24.63" viewBox="0 0 25 25" fill="none" style={{ flexShrink: 0 }}>
                  <circle cx="12.3148" cy="12.3148" r="12.3148" fill="#FF9600" />
                  <path d="M8.62036 12.7253L11.4938 16.0092L17.2407 9.85181" stroke="white" strokeWidth="2.46296" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span
                  className="line-through"
                  style={{
                    fontFamily: 'Inter, sans-serif',
                    fontSize: '18px',
                    color: '#cccccc'
                  }}
                >
                  {success.taskDescription}
                </span>
              </div>

              {/* 视觉验证徽章 */}
              {verification && (verification.isVerifying || verification.result) && (
                <VerificationBadge
                  isVerifying={verification.isVerifying}
                  result={verification.result}
                />
              )}

              {/* 等级 + 进度条 + 皇冠 */}
              <div
                className="flex items-center justify-between"
                style={{
                  width: '323px',
                  padding: '12px',
                  borderRadius: '16px',
                  backgroundColor: '#2E2B28',
                  visibility: success.scene >= 2 ? 'visible' : 'hidden',
                  animation: success.scene >= 2 ? 'slideUpFadeIn 0.8s ease-out forwards' : 'none',
                  opacity: success.scene >= 2 ? 0 : 0
                }}
              >
                <div className="flex flex-col gap-2" style={{ width: '249px' }}>
                  {/* 等级标签 */}
                  <p
                    style={{
                      fontFamily: 'Sansita, sans-serif',
                      fontSize: '18px',
                      fontWeight: 400,
                      color: '#FFFFFF',
                      textTransform: 'uppercase',
                      margin: 0
                    }}
                  >
                    {success.levelText || 'LEVEL:1'}
                  </p>
                  {/* 进度条 */}
                  <div
                    style={{
                      width: '100%',
                      height: '16px',
                      borderRadius: '8px',
                      backgroundColor: '#E5E5E5',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                  >
                    <div
                      style={{
                        width: `${success.progressPercent}%`,
                        height: '100%',
                        background: 'linear-gradient(to right, #FFD700, #FFA500)',
                        borderRadius: '8px',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        transition: 'width 0.05s linear'
                      }}
                    />
                    {/* 闪光效果 */}
                    {success.scene === 3 && success.progressPercent < 80 && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '25%',
                          height: '100%',
                          background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,0) 100%)',
                          animation: 'shimmer 1.5s ease-in-out forwards',
                          pointerEvents: 'none'
                        }}
                      />
                    )}
                  </div>
                </div>
                {/* 皇冠图标 */}
                <img
                  src="/Crow.png"
                  alt="Crown"
                  style={{ width: '37.647px', height: '35.556px' }}
                />
              </div>

              {/* 金币和 CTA 按钮容器 */}
              <div style={{ position: 'relative', width: '323px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {/* 金币显示 - 场景 2-3 */}
                <div
                  className="flex items-center gap-3"
                  style={{
                    position: 'absolute',
                    visibility: success.scene >= 2 && success.scene < 4 ? 'visible' : 'hidden',
                    animation: success.scene >= 2 ? 'slideUpFadeIn 0.8s ease-out 0.2s forwards' : 'none',
                    opacity: success.scene >= 2 ? 0 : 0
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'Sansita, sans-serif',
                      fontSize: '40.307px',
                      fontWeight: 400,
                      letterSpacing: '1.6123px',
                      background: 'linear-gradient(to bottom, #FAF078, #FFC92A)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text'
                    }}
                  >
                    +{success.coins}
                  </span>
                  <img
                    src="/coin.png"
                    alt="Coin"
                    style={{ width: '50.744px', height: '50.743px' }}
                  />
                </div>

                {/* CTA 按钮 - 场景 4 */}
                <button
                  onClick={success.ctaButton.onClick}
                  className="flex items-center justify-center rounded-[16px]"
                  style={{
                    position: 'absolute',
                    width: '314px',
                    height: '46px',
                    padding: '14px 20px',
                    border: '1px solid #FFE28A',
                    background: 'linear-gradient(180deg, #FFEE37 0%, #FE8827 100%)',
                    boxShadow: '0 6px 0 0 #D34A22',
                    animation: success.scene >= 4 ? 'slideUpBounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards' : 'none',
                    opacity: 0,
                    visibility: success.scene >= 4 ? 'visible' : 'hidden',
                    pointerEvents: success.scene >= 4 ? 'auto' : 'none'
                  }}
                >
                  <span
                    className="font-bold uppercase"
                    style={{
                      fontFamily: 'Inter, sans-serif',
                      fontSize: '13px',
                      letterSpacing: '0.8px',
                      color: '#000000',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {success.ctaButton.label}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 失败页面 */}
      {flow === 'failure' && failure && (
        <div className="fixed inset-0" style={{ backgroundColor }}>
          <div className="relative flex flex-col items-center justify-center h-full px-6 gap-12">
            {/* 火焰图标（灰色） */}
            <FailureFireIcon />

            {/* 鼓励文字 */}
            <div
              className="text-center"
              style={{
                fontFamily: 'Sansita, sans-serif',
                fontSize: '40px',
                lineHeight: '1.3',
                color: '#FFC92A',
              }}
            >
              {failure.title || 'You Can Make It'}
              <br />
              {failure.subtitle || 'Next Time!'}
            </div>

            {/* 按钮 */}
            <button
              onClick={failure.button.onClick}
              className="flex items-center justify-center rounded-[16px]"
              style={{
                width: '314px',
                height: '46px',
                padding: '14px 20px',
                border: '1px solid #FFE28A',
                background: 'linear-gradient(180deg, #FFEE37 0%, #FE8827 100%)',
                boxShadow: '0 6px 0 0 #D34A22',
              }}
            >
              <span
                className="font-bold uppercase"
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '13px',
                  letterSpacing: '0.8px',
                  color: '#000000',
                  whiteSpace: 'nowrap'
                }}
              >
                {failure.button.label}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* 彩纸效果 - 始终在最上层 */}
      {flow === 'success' && success && (
        <ConfettiEffect
          active={success.showConfetti}
          numberOfPieces={5000}
          colors={['#FF6B6B', '#4A90E2', '#FFA500', '#FF8C42']}
          recycle={true}
          gravity={0.25}
        />
      )}
    </div>
  );
}
