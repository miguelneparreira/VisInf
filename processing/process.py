"""CP I – Group 05 – UFC: Inside the Octagon. Builds the single unified dataset.
Sources (raw/): ufcstats.com tables (Greco1899/scrape_ufc_stats), active-roster
nationality (nathan-stryker/ufc-fight-model), Sherdog fighters 2017
(LittleLebowskiUrbanAchievers/Data-Collection), countries (mledoze/countries)."""
import pandas as pd, numpy as np, json, re, unicodedata
R='raw/'
strip=lambda s: s.str.strip() if (s.dtype==object or str(s.dtype) in ("str","string")) else s
ev=pd.read_csv(R+'ufc_event_details.csv').apply(strip)
fr=pd.read_csv(R+'ufc_fight_results.csv').apply(strip)
fs=pd.read_csv(R+'ufc_fight_stats.csv').apply(strip)
fd=pd.read_csv(R+'ufc_fighter_details.csv').apply(strip)
tt=pd.read_csv(R+'ufc_fighter_tott.csv').apply(strip)
log={}
log['raw']=dict(events=len(ev),bouts=len(fr),stat_rows=len(fs),fighters=len(tt))

# ---------- countries reference ----------
C=json.load(open(R+'countries.json'))
iso={c['cca2']:c for c in C}
name2iso={}
for c in C:
    for n in [c['name']['common'],c['name']['official'],*c.get('altSpellings',[])]: name2iso[n.lower()]=c['cca2']
name2iso.update({'usa':'US','united states':'US','holland':'NL','england':'GB','scotland':'GB','wales':'GB',
 'northern ireland':'GB','united kingdom':'GB','south korea':'KR','korea':'KR','russia':'RU','czech republic':'CZ',
 'republic of ireland':'IE','ireland':'IE','uae':'AE','united arab emirates':'AE','bosnia and herzegovina':'BA',
 'the netherlands':'NL','bosnia & herzegovina':'BA','cabo verde':'CV','canary islands':'ES','ivory coast':'CI','dr congo':'CD','democratic republic of the congo':'CD','macedonia':'MK','taiwan':'TW'})
ALIAS2={'EN':'GB','SC':'GB','WA':'GB','NI':'GB','UK':'GB'}
def to_iso(x):
    if pd.isna(x) or str(x) in ('None',''): return np.nan
    return name2iso.get(str(x).strip().lower(),np.nan)

# ---------- events ----------
ev['date']=pd.to_datetime(ev.DATE,format='%B %d, %Y')
loc=ev.LOCATION.str.split(', ')
ev['event_city']=loc.str[0]; ev['event_country']=loc.str[-1]
ev['event_iso']=ev.event_country.map(to_iso)
log['event_country_unmapped']=sorted(ev.loc[ev.event_iso.isna(),'event_country'].unique().tolist())

# ---------- bouts ----------
fr=fr.merge(ev[['EVENT','date','event_city','event_country','event_iso']],on='EVENT',how='left')
fr['bout_id']=fr.URL.str.rsplit('/',n=1).str[-1]
wc=fr.WEIGHTCLASS
fr['is_title']=wc.str.contains('Title')
fr['gender']=np.where(wc.str.contains("Women's"),'F','M')
CLASSES=["Strawweight","Flyweight","Bantamweight","Featherweight","Lightweight","Welterweight",
         "Middleweight","Light Heavyweight","Heavyweight","Catch Weight","Open Weight"]
def canon(s):
    for c in sorted(CLASSES,key=len,reverse=True):
        if c.lower() in s.lower(): return ("Women's " if "Women's" in s else "")+c
    return np.nan
fr['weight_class']=wc.map(canon)
def mgroup(m):
    m=m.lower()
    if m.startswith('decision'): return 'DEC'
    if 'ko' in m or 'doctor' in m: return 'KO/TKO'
    if m.startswith('submission'): return 'SUB'
    return 'OTHER'   # DQ, overturned, could not continue, other
fr['method']=fr.METHOD.map(mgroup)
fr['method_detail']=np.where(fr.method=='SUB',fr.DETAILS,
                    np.where(fr.method=='KO/TKO',fr.DETAILS,''))
fr['method_detail']=fr.method_detail.fillna('').str.replace(r'\s+',' ',regex=True).str.strip()
# finish technique + position (hierarchy method > technique > position)
SUBS=['Rear Naked Choke',"D'Arce Choke",'Anaconda Choke','Arm Triangle','Inverted Triangle','Triangle Armbar','Triangle Choke',
      'Guillotine Choke','Ezekiel Choke','Peruvian Necktie','Von Flue Choke','North-South Choke','Other - Choke','Neck Crank','Twister',
      'Armbar','Kimura','Americana','Omoplata','Keylock','Wristlock','Kneebar','Heel Hook','Toe Hold','Ankle Lock','Calf Slicer',
      'Achilles Lock','Banana Split','Other - Lock','Verbal']
KOS=[('Punch','Punch'),('Kick','Kick'),('Knee','Knee'),('Elbow','Elbow'),('Slam','Slam'),('Spinning Back Fist','Punch')]
def technique(r):
    d=str(r.method_detail)
    if r.method=='SUB':
        for t in SUBS:
            if d.startswith(t) or t in d: return t.replace('Other - ','Other ')
        return 'Other'
    if r.method=='KO/TKO':
        for k,v in KOS:
            if d.startswith(k) or d.startswith('Flying '+k) or d.startswith('Spinning '+k): return v
        return 'Stoppage (injury/cut/corner)'
    return r.method if r.method=='DEC' else 'Other'
def position(r):
    d=str(r.method_detail)
    if r.method not in ('SUB','KO/TKO'): return ''
    if 'At Distance' in d or 'Standing' in d: return 'Standing / distance'
    if 'In Clinch' in d: return 'Clinch'
    if any(x in d for x in ['On Ground','From ','After Drop','Guard','Mount','Back Control','Side Control']): return 'Ground'
    return 'Unspecified'
fr['technique']=fr.apply(technique,axis=1)
fr['position']=fr.apply(position,axis=1)
# elapsed time: sum lengths of completed rounds + clock of final round
def elapsed(r):
    try: m,s=map(int,str(r.TIME).split(':'))
    except: return np.nan
    lens=re.findall(r'\d+',str(r['TIME FORMAT']).split('(')[-1]) if '(' in str(r['TIME FORMAT']) else []
    lens=[int(x) for x in lens]; rd=int(r.ROUND)
    prev=sum(lens[:rd-1]) if len(lens)>=rd-1 else 5*(rd-1)
    return prev*60+m*60+s
fr['fight_time_s']=fr.apply(elapsed,axis=1)
fr['end_round']=fr.ROUND.astype(int)
fr['sched_rounds']=fr['TIME FORMAT'].str.extract(r'^(\d) Rnd')[0].astype(float)
f1=fr.BOUT.str.split(' vs. ',n=1).str[0]; f2=fr.BOUT.str.split(' vs. ',n=1).str[1]
fr['f1']=f1; fr['f2']=f2

# ---------- scope ----------
n0=len(fr)
fr=fr[fr.date>='2001-01-01']            # Zuffa era / Unified Rules
log['dropped_pre2001']=n0-len(fr)
n1=len(fr); fr=fr[~fr.weight_class.isin(['Open Weight'])]; log['dropped_openweight']=n1-len(fr)

# ---------- fighter bios ----------
fd['name']=(fd.FIRST.fillna('')+' '+fd.LAST.fillna('')).str.strip()
tt['fighter_id']=tt.URL.str.rsplit('/',n=1).str[-1]
def inch(h):
    m=re.match(r"(\d+)' (\d+)\"",str(h)); return int(m[1])*12+int(m[2]) if m else np.nan
tt['height_cm']=(tt.HEIGHT.map(inch)*2.54).round(1)
tt['reach_cm']=(pd.to_numeric(tt.REACH.str.replace('"',''),errors='coerce')*2.54).round(1)
tt['dob']=pd.to_datetime(tt.DOB,format='%b %d, %Y',errors='coerce')
tt['stance']=tt.STANCE.where(tt.STANCE.isin(['Orthodox','Southpaw','Switch']))
# name -> id (ufcstats bout strings use names; resolve duplicates via event participation)
tt['name']=tt.FIGHTER

# ---------- country of origin ----------
def norm(s): s=unicodedata.normalize('NFKD',str(s)).encode('ascii','ignore').decode().lower(); return re.sub(r'[^a-z ]','',s).strip()
tt['k']=tt.name.map(norm)
# first UFC fight per fighter name (for disambiguating homonyms by debut date)
first=pd.concat([fr[['f1','date']].rename(columns={'f1':'n'}),fr[['f2','date']].rename(columns={'f2':'n'})]).groupby('n').date.min()
tt['first_fight']=tt.name.map(first)
# (1) UFC.com athlete profiles: place of birth (TidyTuesday 2026-07-07 / fightr)
ua=pd.read_csv(R+'tt_athletes.csv'); ua=ua[ua.place_of_birth.notna()].copy()
import html
ua['birth_country']=ua.place_of_birth.map(html.unescape).str.split(', ').str[-1]
ua['iso']=ua.birth_country.map(to_iso)
log['birth_country_unmapped']=sorted(ua.loc[ua.iso.isna(),'birth_country'].unique().tolist())
ua['debut']=pd.to_datetime(ua.octagon_debut,errors='coerce')
cand=pd.concat([ua.assign(k=ua.name.map(norm)),ua.assign(k=ua.profile_name.map(norm))]).drop_duplicates(['url','k'])
m=tt.reset_index().merge(cand[['k','iso','debut','url']],on='k',how='inner')
m['gap']=(m.debut-m.first_fight).abs().dt.days.fillna(99999)
m=m.sort_values('gap').drop_duplicates('index')
m=m[(m.gap<=400)|(m.k.map(cand.k.value_counts())==1)]      # homonyms must agree on debut date
m=m[m.iso.notna()].set_index('index')
tt['origin_iso']=pd.Series(pd.NA,index=tt.index,dtype=object); tt['origin_source']=pd.Series(None,index=tt.index,dtype=object)
tt.loc[m.index,'origin_iso']=m.iso; tt.loc[m.index,'origin_source']='UFC.com birthplace'
# (2) fallback: Sherdog nationality, active roster 2026 (joined by ufcstats fighter id)
act=pd.read_csv(R+'nat_active_ns.csv'); act['fighter_id']=act.fighter_id.str.rsplit('/',n=1).str[-1]
act['iso']=act.iso_code.replace(ALIAS2); act=act.set_index('fighter_id').iso
need=tt.origin_iso.isna()&tt.fighter_id.isin(act.index)
tt.loc[need,'origin_iso']=tt.loc[need,'fighter_id'].map(act); tt.loc[need,'origin_source']='Sherdog nationality (2026 roster)'
# (3) fallback: Sherdog 2017 snapshot, same name AND same date of birth
sh=pd.read_csv(R+'sherdog.csv'); sh['k']=sh.Name.map(norm); sh['iso']=sh.Nationality.map(to_iso)
sh['dob']=pd.to_datetime(sh['Date of Birth'],errors='coerce'); sh=sh[sh.iso.notna()&sh.dob.notna()]
m=tt[tt.origin_iso.isna()].reset_index().merge(sh[['k','iso','dob']],on=['k','dob'],how='inner').drop_duplicates('index').set_index('index')
tt.loc[m.index,'origin_iso']=m.iso; tt.loc[m.index,'origin_source']='Sherdog nationality (2017 snapshot)'
tt['nat_iso']=tt.origin_iso
tt['nationality']=tt.nat_iso.map(lambda c: iso[c]['name']['common'] if c in iso else np.nan)

# ---------- per-fighter bout stats (sum of rounds) ----------
def of(s,i):
    x=s.str.extract(r'(\d+) of (\d+)'); return pd.to_numeric(x[i])
fs['sig_landed']=of(fs['SIG.STR.'],0); fs['sig_att']=of(fs['SIG.STR.'],1)
fs['td_landed']=of(fs['TD'],0); fs['td_att']=of(fs['TD'],1)
def mmss(x):
    m=re.match(r'(\d+):(\d+)',str(x)); return int(m[1])*60+int(m[2]) if m else np.nan
fs['ctrl_s']=fs.CTRL.map(mmss)
fs['kd']=pd.to_numeric(fs.KD,errors='coerce')
agg=fs.groupby(['EVENT','BOUT','FIGHTER'],as_index=False)[['sig_landed','sig_att','td_landed','td_att','ctrl_s','kd']].sum(min_count=1)

# ---------- long format: one row per fighter per bout ----------
rows=[]
for side,me,op in [(1,'f1','f2'),(2,'f2','f1')]:
    d=fr.copy(); d['fighter']=d[me]; d['opponent']=d[op]
    o=d.OUTCOME.str.split('/').str[side-1]
    d['result']=o.map({'W':'W','L':'L','D':'D','NC':'NC'})
    rows.append(d)
L=pd.concat(rows,ignore_index=True)
# resolve fighter ids by name (ufcstats names are unique enough; ambiguous names flagged)
dup=tt.name.value_counts(); amb=set(dup[dup>1].index)
idmap=tt[~tt.name.isin(amb)].set_index('name')
log['ambiguous_names']=len(amb)
def attach(prefix,col):
    j=idmap[['fighter_id','dob','height_cm','reach_cm','stance','nat_iso','nationality']].add_prefix(prefix)
    return L.join(j,on=col)
L=attach('','fighter'); L=L.join(idmap[['reach_cm','dob']].add_prefix('opp_'),on='opponent')
L=L.merge(agg.rename(columns={'FIGHTER':'fighter'}),on=['EVENT','BOUT','fighter'],how='left')
L['age']=((L.date-L.dob).dt.days/365.25).round(1)
L['reach_diff_cm']=(L.reach_cm-L.opp_reach_cm).round(1)
L['sig_acc']=(L.sig_landed/L.sig_att.replace(0,np.nan)).round(3)
L['sig_per_min']=(L.sig_landed/(L.fight_time_s/60)).round(2)
L['is_home']=np.where(L.nat_iso.isna()|L.event_iso.isna(),np.nan,(L.nat_iso==L.event_iso).astype(float))
L['year']=L.date.dt.year
L=L.rename(columns={'EVENT':'event','REFEREE':'referee','nat_iso':'origin_iso','nationality':'origin_country'})
cols=['bout_id','event','date','year','event_country','event_iso','weight_class','gender','is_title',
 'end_round','fight_time_s','method','technique','position',
 'fighter_id','fighter','opponent','result','origin_iso','origin_country','is_home','age','reach_cm','reach_diff_cm',
 'sig_landed','sig_per_min','td_landed','ctrl_s']
F=L[cols].sort_values(['date','bout_id','fighter']).reset_index(drop=True)
F['date']=F.date.dt.strftime('%Y-%m-%d')
for c in ['is_title']: F[c]=F[c].astype(int)
F.to_csv('out/ufc_inside_the_octagon.csv',index=False)
# country lookup for the map (ISO2 -> ISO numeric for world-atlas TopoJSON, centroid)
used=set(F.origin_iso.dropna())|set(F.event_iso.dropna())
pd.DataFrame([{'iso2':c,'iso_num':iso[c].get('ccn3'),'name':iso[c]['name']['common'],
  'lat':iso[c]['latlng'][0],'lon':iso[c]['latlng'][1]} for c in sorted(used) if c in iso]).to_csv('out/countries.csv',index=False)

# ---------- report ----------
log['final_rows']=len(F); log['bouts']=F.bout_id.nunique(); log['events']=F.event.nunique(); log['fighters']=F.fighter_id.nunique()
log['years']=(int(F.year.min()),int(F.year.max()))
miss=F.isna().mean().round(3); log['missing_pct']={k:float(v) for k,v in miss[miss>0].items()}
log['origin_cov_rows']=round(F.origin_iso.notna().mean(),3)
log['origin_cov_by_period']=F.groupby(F.year//5*5).origin_iso.apply(lambda s: round(s.notna().mean(),2)).to_dict()
log['origin_sources']=tt.loc[tt.fighter_id.isin(F.fighter_id),'origin_source'].value_counts(dropna=False).to_dict()
json.dump(log,open('out/processing_log.json','w'),indent=1,default=str)
print(json.dumps(log,indent=1,default=str))
