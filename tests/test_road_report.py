from backend.road_report import printable_report,road_story

def test_report_keeps_prior_blockage_when_current_view_is_clear_and_escapes_html():
    scene={'understanding':'Normal traffic now.','recommendation':'Review route'}
    event={'eventType':'HAZARD_ROAD_CLOSURE_SCENE','title':'Road blockage detected','severity':'WARNING','state':'ENDED','timestampSeconds':8.2,'description':'Barricades <visible>','recommendation':'Avoid road','story':[],'evidence':{}}
    data={'source':'test <video>','currentState':scene,'events':[event],'limitations':['hidden diagnostic']}
    assert 'Road blockage detected' in road_story(scene,[event])
    page=printable_report(data)
    assert 'Road blockage detected' in page and '00:08.20' in page
    assert '&lt;video&gt;' in page and '&lt;visible&gt;' in page
    assert 'hidden diagnostic' not in page and 'Model limitations' not in page
