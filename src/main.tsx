import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import './styles.css';
import './richText.css';
class ErrorBoundary extends React.Component<{children:React.ReactNode},{error:string}>{state={error:''};static getDerivedStateFromError(e:Error){return {error:e.message};}render(){return this.state.error?<div className="fatal-error" role="alert"><h1>頁面發生錯誤 / Page error</h1><p>{this.state.error}</p><p>系統沒有自動提交或覆蓋資料。請記錄錯誤內容再聯繫管理者。 / No automatic write or overwrite was made.</p></div>:this.props.children;}}
createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><App/></ErrorBoundary></React.StrictMode>);
