"""Readable road story shared by the live report and printable summary."""
from html import escape


def moment(seconds):
    minutes,seconds=divmod(float(seconds),60)
    return f'{int(minutes):02}:{seconds:05.2f}'


def road_story(scene,events):
    important=[event for event in events if event.get('severity') in {'WARNING','CRITICAL','NOTICE'} and event.get('eventType')!='ACCESS_CHANGE']
    findings=list(dict.fromkeys(event.get('title',event['eventType']) for event in important))
    if not findings:return scene['understanding']
    first=important[0]
    return f'At {moment(first["timestampSeconds"])}, {first.get("title",first["eventType"]).lower()}. Recorded findings: '+ '; '.join(findings)+'. Current view: '+scene['understanding']


def printable_report(data):
    scene=data['currentState'];events=data['events']
    important=[e for e in events if e.get('severity') in {'WARNING','CRITICAL','NOTICE'}]
    key_findings=''.join(f'<li><strong>{escape(e.get("title",e["eventType"]))}</strong> · {moment(e["timestampSeconds"])} · {escape(e.get("state",""))}</li>' for e in important)
    cards=[]
    for event in events:
        images=''.join(f'<figure><img src="{escape(value["image"],quote=True)}"><figcaption>{role.capitalize()} · {moment(value.get("timestampSeconds",event["timestampSeconds"]))}</figcaption></figure>' for role,value in event.get('evidence',{}).items() if role in {'before','event','after'})
        story=''.join(f'<li>{moment(item["time"])} — {escape(item["description"])}</li>' for item in event.get('story',[]) if 'Evidence window' not in item['description'])
        tracks=', '.join(event.get('involvedTracks',[]))
        lanes=', '.join(event.get('affectedLanes',[]))
        cards.append(f'<article><h3>{moment(event["timestampSeconds"])} — {escape(event.get("title",event["eventType"]))}</h3><p>{escape(event.get("description",""))}</p>'+
            (f'<p>Vehicles involved: {escape(tracks)}</p>' if tracks else '')+
            (f'<p>Affected lanes: {escape(lanes)}</p>' if lanes else '')+
            f'<p><strong>Action:</strong> {escape(event.get("recommendation",""))}</p><div class="evidence">{images}</div><ol>{story}</ol></article>')
    return f'''<!doctype html><html><head><meta charset="utf-8"><title>AEGIS road summary</title>
<style>body{{font:15px system-ui;max-width:960px;margin:32px auto;padding:24px;color:#18302c}}h1{{font-size:28px}}.summary{{padding:20px;background:#eef4ef;border-left:4px solid #326848}}.evidence{{display:flex;gap:12px;flex-wrap:wrap}}figure{{margin:0;flex:1;min-width:180px}}img{{width:100%;max-height:260px;object-fit:contain}}figcaption{{font-size:12px}}article{{break-inside:avoid;border-top:1px solid #b8c8bd;padding:18px 0}}li{{margin:8px 0}}@media print{{button{{display:none}}body{{margin:0;padding:10px}}}}</style></head><body>
<button onclick="window.print()">Print / Save PDF</button><h1>AEGIS · Road situation summary</h1><p>{escape(data['source'])}</p>
<section class="summary"><h2>What happened</h2><p>{escape(road_story(scene,events))}</p><h3>Current action</h3><p>{escape(scene['recommendation'])}</p></section>
<h2>Important road events</h2><ul>{key_findings or '<li>No important road event recorded.</li>'}</ul>
<h2>Road transcript &amp; captured evidence</h2>{''.join(cards)}</body></html>'''
