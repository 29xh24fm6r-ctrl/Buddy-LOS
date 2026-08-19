export function LocalDateTimeField({name,label,required=false}:{name:string;label:string;required?:boolean}){
  return <label>{label}<input type="datetime-local" name={name} required={required}/></label>;
}
