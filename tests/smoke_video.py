"""Manual real-model smoke test. Uses a static sample image, not traffic ground truth.
Run: python tests/smoke_video.py --image /path/to/a/vehicle.jpg
"""
import argparse
import json
import tempfile
from pathlib import Path
import cv2
import numpy as np
from fastapi.testclient import TestClient
from backend.main import app


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--image',required=True);args=parser.parse_args()
    image=cv2.imread(args.image)
    if image is None: raise ValueError('Image is not readable')
    image=cv2.resize(image,(640,480))
    with tempfile.TemporaryDirectory() as directory:
        path=Path(directory)/'smoke.mp4'
        writer=cv2.VideoWriter(str(path),cv2.VideoWriter_fourcc(*'mp4v'),10,(640,480))
        assert writer.isOpened()
        for index in range(30):
            transform=np.float32([[1,0,min(index,10)],[0,1,0]])
            writer.write(cv2.warpAffine(image,transform,(640,480)))
        writer.release()
        with TestClient(app) as client:
            response=client.post('/api/videos/upload',files={'file':('INFERENCE_SMOKE_TEST.mp4',path.read_bytes(),'video/mp4')})
            assert response.status_code==200,response.text
            video_id=response.json()['id']
            response=client.post(f'/api/videos/{video_id}/analyze',json={'mode':'FAST','roi':[[0,0],[1,0],[1,1],[0,1]]})
            assert response.status_code==200,response.text
            state=client.get(f'/api/videos/{video_id}/status').json()
            assert state['status']=='complete',state
            summary=client.get(f'/api/videos/{video_id}/summary').json()
            assert summary['totalUniqueVehicles']>=1,summary
            for artifact in ['summary','events','frames']:
                assert client.get(f'/api/videos/{video_id}/export/{artifact}').status_code==200
            output=client.get(f'/api/videos/{video_id}/output-video')
            assert output.status_code==200
            out=Path(directory)/'output.mp4';out.write_bytes(output.content)
            capture=cv2.VideoCapture(str(out));assert capture.isOpened();assert int(capture.get(cv2.CAP_PROP_FRAME_COUNT))==30;capture.release()
            assert summary['emergencyRoadScore'] is None
            print(json.dumps(dict(videoId=video_id,summary=summary,outputBytes=len(output.content)),indent=2))
if __name__=='__main__': main()
