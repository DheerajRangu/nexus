import argparse
import json
from pathlib import Path

def main():
    p=argparse.ArgumentParser();p.add_argument('--model',required=True);p.add_argument('--data',required=True);p.add_argument('--split',choices=['val','test'],default='test');p.add_argument('--device',default='cpu');p.add_argument('--imgsz',type=int,default=640);a=p.parse_args()
    from ultralytics import YOLO
    model=YOLO(a.model);metrics=model.val(data=a.data,split=a.split,device=a.device,imgsz=a.imgsz,plots=True,project='runs/aegis_vision',name='validation')
    classes={}
    for i,cls in enumerate(metrics.box.ap_class_index):
        precision,recall,map50,map95=metrics.box.class_result(i)
        classes[model.names[int(cls)]]=dict(precision=float(precision),recall=float(recall),mAP50=float(map50),mAP50_95=float(map95))
    # Classes with no ground truth must not be assigned invented performance.
    for name in model.names.values(): classes.setdefault(name,dict(precision=None,recall=None,mAP50=None,mAP50_95=None,reason='No ground-truth support in split'))
    matrix=metrics.confusion_matrix.matrix
    n=len(model.names)
    report=dict(aggregate={k:float(v) for k,v in metrics.results_dict.items()},perClass=classes,confusionMatrix=matrix.tolist(),falsePositives={model.names[i]:int(matrix[i,n]) for i in range(n)},falseNegatives={model.names[i]:int(matrix[n,i]) for i in range(n)},split=a.split)
    out=Path(metrics.save_dir)/'metrics.json';out.write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
if __name__=='__main__': main()
