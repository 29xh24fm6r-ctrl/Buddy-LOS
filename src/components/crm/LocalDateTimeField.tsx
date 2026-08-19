"use client";

import { useState } from "react";

export function LocalDateTimeField({name,label,required=false}:{name:string;label:string;required?:boolean}){
  const [local,setLocal]=useState("");
  const iso=local&&!Number.isNaN(new Date(local).getTime())?new Date(local).toISOString():"";
  return <label>{label}<input type="datetime-local" value={local} onChange={event=>setLocal(event.target.value)} required={required}/><input type="hidden" name={name} value={iso}/></label>;
}
