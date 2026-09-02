/**
 * Sharker 鲨鱼标：空态、引导页、关于页共用。
 */

import type { CSSProperties } from 'react';
import mark from './sharker-mark.png';

export interface SharkerWordmarkProps {
  /** 渲染宽度；高度按原图比例跟。 */
  width?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

/** 空态 / 引导页 / 关于页的 Sharker 鲨鱼标 */
export function SharkerWordmark({
  width = 160,
  className,
  style,
  title,
}: SharkerWordmarkProps) {
  return (
    <img
      src={mark}
      width={width}
      alt={title ?? ''}
      className={['sharker-wordmark', className].filter(Boolean).join(' ')}
      style={style}
      draggable={false}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    />
  );
}
