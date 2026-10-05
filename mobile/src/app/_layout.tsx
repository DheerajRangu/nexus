import {Stack}from'expo-router';
import {StatusBar}from'expo-status-bar';
import {AegisProvider}from'../lib/provider';
export default function RootLayout(){return <AegisProvider><StatusBar style="light"/><Stack screenOptions={{headerShown:false,contentStyle:{backgroundColor:'#0b1212'},animation:'fade_from_bottom'}}><Stack.Screen name="(tabs)"/><Stack.Screen name="login" options={{presentation:'modal',animation:'slide_from_bottom'}}/></Stack></AegisProvider>;}
