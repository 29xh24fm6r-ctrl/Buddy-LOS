export function LocalDateTimeField({name,label,timezone,required=false}:{name:string;label:string;timezone:string;required?:boolean}){
  return <label>{label} <small>({timezone})</small><input type="datetime-local" name={name} required={required}/></label>;
}
