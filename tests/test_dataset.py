import csv
from pathlib import Path
import pytest
import yaml
from ai.training.split_dataset import split

def test_split_source_isolation(tmp_path):
    rows=[]
    for group in range(10):
        for frame in range(3):
            image=tmp_path/f'{group}_{frame}.jpg';image.write_bytes(b'image')
            label=image.with_suffix('.txt');label.write_text('0 0.5 0.5 0.1 0.1\n')
            rows.append(dict(image=str(image),label=str(label),group=str(group),frame=frame))
    manifest=tmp_path/'manifest.csv'
    with manifest.open('w',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
    output=tmp_path/'dataset';split(manifest,output)
    allocation=yaml.safe_load((output/'source_split.yaml').read_text())
    assert allocation['imageCounts']=={'train':21,'val':6,'test':3}
    assert len(allocation['groups'])==10
    for part in ['train','val','test']:
        assert len(list((output/'labels'/part).glob('*.txt')))==allocation['imageCounts'][part]
    assert len(yaml.safe_load((output/'data.yaml').read_text())['names'])==20

def test_missing_annotations_rejected(tmp_path):
    manifest=tmp_path/'manifest.csv';manifest.write_text('image,label,group,frame\nmissing.jpg,missing.txt,video1,0\n')
    with pytest.raises(ValueError,match='Missing image'): split(manifest,tmp_path/'dataset')
