'use client';
import type {ReactNode} from 'react';
import {X,ArrowUpRight,Activity} from 'lucide-react';
export function Badge({children,tone='green'}:{children:ReactNode;tone?:string}){return <span className={'badge '+tone}>{children}</span>}
export function Panel({title,tag,children,className=''}:{title:string;tag?:ReactNode;children:ReactNode;className?:string}){return <section className={'panel '+className}><div className="panel-heading"><h3>{title}</h3>{tag}</div>{children}</section>}
export function Modal({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}){return <div className="modal-backdrop" onClick={onClose}><section className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={e=>e.stopPropagation()}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20}/></button></div>{children}</section></div>}
export function Empty(){return <div className="empty"><Activity size={28}/><h3>No active emergencies</h3><p>All monitored zones are currently stable.</p></div>}
export const time=(n:number)=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
export function Kpi({label,value,unit,detail,icon,tone='green',chart=false}:{label:string;value:string;unit?:string;detail:string;icon:ReactNode;tone?:string;chart?:boolean}){return <div className="kpi"><div className="kpi-label">{label}<span>{icon}</span></div><div className="kpi-value">{value}<small>{unit}</small>{chart&&<svg className="sparkline" viewBox="0 0 90 32"><path d="M0 28L12 24L22 27L35 17L45 20L59 11L69 15L82 5L90 8" fill="none" stroke="currentColor" strokeWidth="2"/></svg>}</div><div className={'kpi-detail '+tone}>{detail}</div></div>}
