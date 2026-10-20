// Auto Rename -- pembantu UI bersama: hook langganan engine + komponen kecil. Engine = src/utils/autoRename/*.
import React, { useSyncExternalStore } from 'react'
import { subscribe, getVersion } from '../../utils/autoRename/store'

/** Render ulang komponen setiap kali engine memanggil emit(). */
export function useEngine() { return useSyncExternalStore(subscribe, getVersion) }

export const Chip: React.FC<{ cls?: string; title?: string; children: React.ReactNode }> = ({ cls = '', title, children }) => (
  <span className={`chip ${cls}`.trim()} title={title}>{children}</span>
)

export const Muted: React.FC<{ children: React.ReactNode; small?: boolean }> = ({ children, small }) => <p className={`muted${small ? ' small' : ''}`}>{children}</p>
